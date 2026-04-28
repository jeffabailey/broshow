# Observability Design: BroShow

## Hard constraint up front

> **Network requests made: 0** — no Sentry, Datadog, PostHog, GA, OpenTelemetry collector, or any HTTP/HTTPS sink. Anything that phones home is rejected at design time.

> **Permissions <= 4** — observability MUST NOT introduce new manifest permissions. The extension already needs `storage` (per current implementation) for state persistence; the logger reuses it. No new permissions.

> **Extension size < 500KB excl. mp4 muxer** — the logger must be tiny (target: < 4KB minified).

This means traditional "observability" (remote dashboards, traces, distributed metrics) is replaced by **local structured logging with explicit user export**.

## Logger Module Design

### Location and shape

Module: `src/logger.ts` (functional, no class).

```typescript
// Conceptual interface — actual implementation by software-crafter
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogEvent = {
  ts: number              // epoch ms
  level: LogLevel
  source: 'popup' | 'background' | 'offscreen'
  event: string           // structured event name, e.g. 'recording.start'
  data?: Record<string, unknown>   // small structured payload, redacted
}

export type Logger = {
  log: (level: LogLevel, source: LogEvent['source'], event: string, data?: LogEvent['data']) => Promise<void>
  exportAll: () => Promise<LogEvent[]>
  clear: () => Promise<void>
}

export function createLogger(opts?: {
  enabled?: boolean        // user opt-in; default false
  ringBufferSize?: number  // default 500 events
  consoleMirror?: boolean  // default true in dev, false in prod build
}): Logger
```

### Storage strategy

- **Primary sink**: `chrome.storage.local` under key `broshow.logs`. Stored as a single JSON-serialized ring buffer (array of `LogEvent`). Bounded to **500 events by default**.
- **Eviction**: FIFO. When buffer hits cap, oldest event drops.
- **Size cap**: ~500 events × ~250 bytes/event ≈ ~125KB worst-case in `chrome.storage.local` (which has a 10MB default quota — well within budget).
- **Concurrency**: writes are serialized via an in-memory promise queue per execution context (popup/SW/offscreen). Cross-context coordination relies on `chrome.storage.local`'s atomic write semantics; last-writer-wins is acceptable for an event log.
- **Console mirror**: in dev builds (`NODE_ENV !== 'production'` checked at build time via esbuild `define`), each event is also `console.log`-ed at the appropriate level. In production builds, console mirror is disabled by default to avoid cluttering the user's DevTools.

### Opt-in model

Logging is **off by default** (writes nothing to storage). The user enables it via a hidden toggle in the popup (or via DevTools by setting `chrome.storage.local.set({'broshow.logging.enabled': true})`).

Rationale: a recording tool that silently writes structured logs to the user's storage feels invasive. Opt-in matches the privacy posture of the zero-network KPI.

When disabled, `logger.log()` is a no-op (returns resolved promise instantly). This keeps call sites identical between dev and prod.

### Export workflow

User clicks "Export logs" button (in popup, only visible when logging is enabled):

1. Popup sends `export-logs` message to background.
2. Background calls `logger.exportAll()` to read the ring buffer.
3. Background creates a `Blob` with `application/json`, generates a `blob:` URL, and triggers `chrome.downloads.download({ url, filename: 'broshow-logs-YYYY-MM-DD.json' })`.
4. User saves the file locally and can attach to a bug report.

Note: this reuses the existing `chrome.downloads` permission already used to save the mp4 — **no new permission required**.

### Redaction rules (mandatory)

The `data` payload of any `LogEvent` MUST NOT contain:

| Forbidden | Why |
|-----------|-----|
| Tab URL or title | PII / browsing history leak |
| Page contents | PII |
| Username, email, device identifier | PII |
| Stream IDs (raw) | Tab identifier; hash if needed |
| Blob URLs (raw) | Hash if needed; they reference user content |
| Any string > 200 chars | Accidental payload leak |

The logger SHOULD include a sanitizer pass at write time that drops keys matching `^url$|^href$|^title$|^content$|^email$|^user.*$` and truncates string values > 200 chars to `'<redacted:len=NNN>'`. This is a defense-in-depth measure — call sites should also avoid passing PII in the first place.

### Log levels

| Level | Use |
|-------|-----|
| `debug` | High-volume internal state transitions. Off by default even when logging is enabled. |
| `info`  | KPI-relevant events (`recording.start`, `recording.stop`, `mp4.ok`, `mp4.fallback`). |
| `warn`  | Recoverable issues (`offscreen.reconnect`, `tab.closed-during-recording`). |
| `error` | Hard failures (`tabcapture.denied`, `mediarecorder.error`, `mp4.fail`). |

## Each KPI → local measurement

Detailed event names and assertions are in `kpi-instrumentation.md`. Summary here:

| KPI | Local measurement |
|-----|-------------------|
| Recording success rate >= 95% | Count `recording.start` vs `recording.complete` events in exported log |
| Time to first recording < 30s | Compare `extension.installed` (from `chrome.runtime.onInstalled`) to first `recording.complete` event |
| Steps to record <= 3 clicks | Acceptance test asserts UI shape (1 button visible at a time, 2 messages round-trip) — no logging needed |
| Mp4 conversion success >= 90% | Count `mp4.ok` vs `mp4.fallback` + `mp4.fail` |
| A/V drift < 100ms | Logged from offscreen as `mp4.av-drift-ms` numeric field on `mp4.ok` event; verifiable post-hoc |
| Plays in major players | Manual verification (cannot be automated locally without VLC/QT/WMP); CI uses `mp4-muxer`'s output validation as a proxy |
| Network requests = 0 | CI assertion in Playwright (`page.on('request')`); no runtime check needed |
| Permissions <= 4 | CI assertion on `manifest.json`; no runtime check needed |
| Extension size < 500KB | CI assertion on `dist/`; no runtime check needed |

## Three Pillars (adapted)

| Pillar | Standard form | BroShow form |
|--------|---------------|--------------|
| Logs | Centralized log aggregator | Local `chrome.storage.local` ring buffer + manual export |
| Metrics | Time-series DB (Prometheus, etc.) | Counted at log-export time by tooling/dev (no runtime aggregation) |
| Traces | Distributed tracing | N/A — single browser process; correlation via per-recording `recordingId` UUID in event `data` |

A `recordingId` is generated on `recording.start` (in the service worker) and threaded through every log event for that recording session. This lets a developer reading the exported log reconstruct the full lifecycle (start → offscreen-start → chunks → stop → mux → download) for a single recording, even when multiple are in the buffer.

## SLOs (adapted)

Standard SLOs (e.g., "99.9% of requests succeed") don't translate directly because there is no fleet and no traffic. The KPI table from `outcome-kpis.md` IS the SLO list. They are validated:

- **Per-build** in CI (size, permissions, network = 0)
- **Per-recording** at runtime via the local log (success rate, mp4 conversion, A/V drift)
- **Per-release** by the developer reviewing exported logs from real usage before submitting to CWS

There is no error budget burn-rate alerting because there is no on-call rotation. Instead, the developer reviews logs on demand before each release.

## What we explicitly are NOT doing

| Standard practice | Why we skip it |
|-------------------|----------------|
| OpenTelemetry SDK | Adds size; no remote collector to send to anyway |
| Sentry / crash reporting | Outbound network → KPI violation |
| Performance API beacons | `navigator.sendBeacon` is HTTP → KPI violation |
| GA / PostHog product analytics | Outbound network → KPI violation |
| Background sync of logs | Outbound network → KPI violation |
| Dashboards (Grafana, etc.) | Nothing to feed them |
| PagerDuty / alerting | No incident response role |
