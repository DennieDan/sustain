---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# activate() test hook and happy-dom DOM tests

## Context and Problem Statement

The viewer spans two processes: the extension host and a sandboxed webview iframe. `@vscode/test-electron` tests run in the extension host and cannot reach into the webview's DOM or see what the host posts to it, and the webview code cannot run in the extension host at all. How do we test both halves (FR-TEST-01, the `[dom]` requirements)?

## Decision Drivers

* Every `[e2e]` AC must be checked in a real VS Code.
* Webview behaviour (rendering, viewport math, tooltip timing, clicks) needs deterministic tests with fake timers.
* No test-only code paths that users can trigger.

## Considered Options

* `activate()` returns a small hook (`panelState()`, `postFromWebview(msg)`) used only by e2e tests; webview modules are tested in vitest with `happy-dom`
* Drive the real webview iframe from e2e tests (e.g. through a debugging protocol)
* Hidden test-only commands registered by the extension

## Decision Outcome

Chosen option: "`activate()` returns a small hook; webview modules are tested with happy-dom", because the hook exercises the host's real message handler and the webview code runs unchanged in a DOM emulator.

* `TestHook` (src/extension/extension.ts): `viewers(): {file, baseline, active, title}[]` reports every open viewer tab; `postFromWebview(file, msg): Promise<void>` hands a `WebviewMessage` to the `handleMessage` of a viewer of `file` (the active one first), the same method `onDidReceiveMessage` calls, and resolves when it has been handled (e.g. the editor is open). It is returned from `activate()`, so it is only reachable through `vscode.extensions.getExtension("sustain.sustain").exports`, and is not documented for users. (Originally `panelState()` and `postFromWebview(msg)` for the single panel; changed by [ADR 0033](0033-custom-editor-for-sir-files.md).)
* Observable host effects that the hook does not report are checked through public API: tab labels and groups (`window.tabGroups`), `window.activeTextEditor`, and UI calls stubbed on the shared `vscode.window` object (`test/e2e/stubs.ts`).
* Webview modules (`render`, `viewport`, `tooltip`, `click`, `main`) are tested in the vitest `dom` project (happy-dom). `main.test.ts` mocks `layoutDiagram`, `acquireVsCodeApi` and the canvas context.

### Consequences

* Good, because e2e tests use the production message path and run in seconds.
* Good, because DOM tests use fake timers for the 300/200 ms tooltip delays.
* Bad, because no automated test runs the real webview inside VS Code; the CSP and visual checks stay `[manual]` (a throwaway headless-Chromium run under the exact CSP backs them up, see ADR 0024).
* Bad, because the hook is part of the extension's exports, visible to other extensions (it can only open sources and report the panel file).

### Confirmation

`test/e2e/suite/single.navigate.test.ts`, `single.watch.test.ts`, `single.view.test.ts` use the hook; `test/dom/*.test.ts` cover the webview.

## Pros and Cons of the Options

### Hook + happy-dom

* Good, because it is small and uses production code paths.
* Bad, because webview ↔ host wiring itself (postMessage) is only covered manually.

### Drive the real iframe

* Good, because it would be end-to-end.
* Bad, because webview iframes are not reachable from the extension host, and remote debugging adds fragile infrastructure.

### Hidden test commands

* Good, because no exports are needed.
* Bad, because commands are user-invocable from the command palette and keybindings.
