---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Viewer details not fixed by the spec

## Context and Problem Statement

FR-VIEW-01..07 fix the commands, messages, panel behaviour, zoom range, keys and tooltip timing. Building them required further user-visible choices: how files are named in errors, the panel title for a file without `meta.title`, QuickPick text, what "no editor is open" means, zoom steps and wheel rates, the fit padding, tooltip placement, and the order of candidates with equal timestamps.

## Decision Drivers

* Keep every string the spec gives verbatim (ADR 0021).
* Behave like VS Code's own editors where the spec is silent.

## Considered Options

* The choices listed below
* Ask the owner for each detail before building

## Decision Outcome

Chosen option: "The choices listed below", because none changes a spec string or behaviour, and each is a one-line change if the owner prefers otherwise.

Host (src/extension/panel.ts, open.ts, src/model/discovery.ts):

* `<file>` in "Can't show `<file>`: <reason>" is the path relative to the repo root (`.archify/<run>/candidate.json`), or the base name for files outside it. Reasons: `invalid JSON (<parser message>)`, `the root is not a JSON object`, `it has no components`, `it has no components with an id`, or the read error.
* Panel title: `Architecture: <meta.title>`, falling back to the file's base name when there is no title or the file cannot be shown.
* "No editor is open" means `window.visibleTextEditors` is empty.
* Open Architecture File…: items are labelled with the run folder and described by `meta.title`; placeholder "Architecture diagram"; "Browse…" opens a file dialog filtered to `JSON: json`, starting in the chosen folder. A browsed file under `<R>/.archify/<run>/` uses `<R>` as repo root.
* Candidates with equal sort keys (FR-VIEW-02) fall back to the folder name, descending, so the order is total.
* The webview HTML contains only the CSP, the stylesheet link and the script; `dist/webview.js` builds the DOM. The bundle is minified.

Webview (webview/):

* Fit: largest scale that fits with 24 px padding (the Scene bounds already carry a 40 px margin), clamped to 10–400 %, centred.
* Toolbar and keys zoom by ×1.25 around the panel centre; 100 % keeps the centre. Ctrl/⌘ + wheel and pinch zoom by `exp(−delta × 0.005)` around the pointer, per event clamped to ±100 px. Plain wheel pans; Shift + vertical wheel pans horizontally. Keys are ignored while Ctrl, ⌘ or Alt is held so VS Code shortcuts keep working.
* Dragging pans when it starts outside a node (boundaries and edges count as empty canvas).
* Tooltip: below the node with a 6 px gap (above when there is no room), clamped to the window; it hides on any pan or zoom. Source entries are buttons; a component without sources shows no source list.
* The viewport is not persisted while the panel is hidden; a re-created webview fits again (FR-VIEW-06 only requires keeping it on reload of the same file).

### Consequences

* Good, because every detail is recorded and tested where it is observable.
* Bad, because zoom and pan feel can only be judged by hand (`[manual]`, FR-VIEW-06).

### Confirmation

`test/e2e/suite/single.view.test.ts`, `test/unit/model/discovery.test.ts`, `test/dom/viewport.test.ts`, `test/dom/tooltip.test.ts`, `test/dom/main.test.ts`.
