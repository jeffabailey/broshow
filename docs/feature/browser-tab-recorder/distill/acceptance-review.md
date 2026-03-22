# Acceptance Review: browser-tab-recorder

## Coverage Matrix

| User Story | Acceptance Test | Milestone |
|------------|----------------|-----------|
| US-01: Install extension | `walking-skeleton.spec.ts` — popup shows Start button | Skeleton |
| US-02: Start tab recording | `walking-skeleton.spec.ts` — click Start, Stop appears | Skeleton |
| US-03: Stop recording | `walking-skeleton.spec.ts` — click Stop, file downloaded | Skeleton |
| US-04: Download as WebM | `walking-skeleton.spec.ts` — e2e test, file > 1KB | Skeleton |
| US-05: Convert to mp4 | `milestone-2-mp4-output.spec.ts` — file has ftyp signature | Mp4 |
| US-06: WebM fallback | `milestone-2-mp4-output.spec.ts` — fallback notice visible | Mp4 |
| US-07: Recording indicator | `milestone-3-polish.spec.ts` — badge REC / cleared | Polish |
| US-08: Tab audio capture | `milestone-3-polish.spec.ts` — audio test page recording | Polish |
| US-09: Sensible filename | `milestone-3-polish.spec.ts` — filename regex match | Polish |
| US-10: Firefox compat | Deferred — requires separate Playwright config | Cross-Browser |

## Story Coverage: 9/10 (90%)

US-10 (Firefox) is deferred as a stretch goal and requires a fundamentally different test setup.

## Acceptance Criteria Coverage

| AC | Test | Covered |
|----|------|---------|
| AC-01: Complete recording flow | `walking-skeleton.spec.ts` e2e | Yes |
| AC-02: Permission denial recovery | Not covered (Playwright limitation) | Partial |
| AC-03: Recording indicator | `milestone-3-polish.spec.ts` | Yes |
| AC-04: Tab closed during recording | Not covered (hard to simulate safely) | No |
| AC-05: Mp4 fallback | `milestone-2-mp4-output.spec.ts` | Yes |
| AC-06: No network requests | Best verified via code review + CSP | Manual |
| AC-07: Brave compatibility | Same tests, different browser launch | Config |
| AC-08: Filename format | `milestone-3-polish.spec.ts` | Yes |

## Notes

- **AC-02 (permission denial)**: Playwright's Chromium automation makes it difficult to simulate denial of the tab capture dialog. This scenario is best verified manually or with a focused unit test on the service worker's error handling.
- **AC-04 (tab closed)**: Closing a tab during recording could interfere with test stability. Best verified manually.
- **AC-06 (no network)**: Verified by reviewing manifest.json permissions and checking that no `fetch`/`XMLHttpRequest` calls exist in source code. Can also use Chrome DevTools network panel during manual testing.

## Implementation Order

1. Remove `test.skip` from `walking-skeleton.spec.ts` tests one at a time
2. Implement code to make each test pass (Outside-In TDD)
3. When all skeleton tests pass, move to `milestone-2-mp4-output.spec.ts`
4. Continue through milestones sequentially
