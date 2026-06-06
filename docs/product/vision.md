# BroShow — Product Vision

> Bootstrapped during DISCUSS for `record-all-tabs` (2026-06-05). This is the
> seed SSOT vision; refine as later features add evidence.

## What BroShow is

A browser extension that records a browser tab and saves it as an mp4 (with a
webm fallback). Zero-friction capture: click the toolbar icon, record, get a
file. No account, no upload, no cloud — recording and muxing happen locally.

## Who it serves

People who need to capture *what happens in their browser* and share it as a
clean video file: developer advocates recording walkthroughs, founders
recording product demos, support engineers recording bug repros, teachers
recording how-tos.

## Principles

- **Local-first / private** — capture and mux on-device; nothing leaves the browser.
- **One-gesture capture** — start and stop must each be a single deliberate action.
- **Honest indicators** — the user always knows when, and now *what*, is being recorded.
- **Cross-target** — Chromium (offscreen + tabCapture) and Firefox (getDisplayMedia)
  behind a single target-blind `RecorderHost` port.

## Outcome we optimize for

A user can go from "I need to show this" to "here is the mp4" without editing,
stitching, or re-recording.

## Current capability map

| Capability | Feature | Status |
|---|---|---|
| Record a single active tab → mp4 | `browser-tab-recorder` | shipped |
| Record the desktop screen | `desktop-screen-recording` | shipped |
| Firefox recording path | `firefox-recording-support` | shipped |
| Marketplace listing/publishing | `marketplace-publishing` | shipped |
| Record across multiple tabs (follow active tab) | `record-all-tabs` | **in DISCUSS** |
