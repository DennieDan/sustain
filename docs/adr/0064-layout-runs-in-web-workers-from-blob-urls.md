---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Layout runs in Web Workers from Blob URLs

## Context and Problem Statement

ADR-0010 runs elkjs in the webview's own thread, so a large map blocks the page while both directions lay out one after the other, and NFR-SEC-01's CSP allowed no workers. Spec v0.3 VWR-02 moves the layout into Web Workers started from Blob URLs, with RIGHT and DOWN in parallel, and lets the CSP gain exactly `worker-src blob:`. How do the pages get ELK's worker code, and what still runs in the page?

## Considered Options

* ELK's own split: its small API in the page, and its worker code embedded as a string and started from a Blob URL, one worker per direction
* The bundled ELK inside a worker of our own
* Layout in the extension host

## Decision Outcome

Chosen option: "ELK's own split", because ELK's worker code already speaks its API's protocol, and the pages carry ELK once, not twice.

* Everything ADR-0010 decided about authored positions, ELK's options and the choice of direction stands.
* The build reads `elkjs/lib/elk-worker.min.js` and embeds it in the webview, the diagram page and the cloud's viewer as `__SUSTAIN_LAYOUT_WORKER__`. The viewer makes one Blob URL of it and an `ELK` from `elk-api.js` per direction, each with its own worker, so RIGHT and DOWN lay out in parallel.
* `src/layout/elk.ts` builds ELK's graph and reads its result for any engine. Node code, the tests and the fixtures use bundled ELK in the thread.
* The webview's CSP is `default-src 'none'; script-src 'nonce-…'; style-src <cspSource>; worker-src blob:`, and the diagram page's gains the same `worker-src blob:`. Nothing else is allowed.

### Consequences

* Good, because the page stays responsive while a large map lays out, and the two directions take the time of one.
* Bad, because a page that forbids Blob workers cannot lay a map out.

### Confirmation

`test/unit/layout/worker.test.ts` runs ELK's embedded worker code through ELK's API, the way the viewer does, and gets the same scene as in the thread for every fixture. `test/unit/layout/perf.test.ts` checks the 60/120 median under 1 s on CI's Ubuntu runner. The CSP strings are checked in `html.test.ts` and `page.test.ts`.
