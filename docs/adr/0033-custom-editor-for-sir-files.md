---
status: accepted
date: 2026-10-19
decision-makers: owner
---

# Read-only custom editor for .sir files

## Context and Problem Statement

[ADR 0011](0011-webview-panel-viewer-with-code-beside.md) put the diagram in one `WebviewPanel` per window, partly because a custom editor bound to `candidate.json` would take over the JSON editor for that file. The panel is not tied to a file: users cannot open a diagram from the Explorer, can show only one diagram at a time, and need a separate "Open Architecture File…" picker with "Browse…". Renaming the accepted diagram to `candidate.sir` (Sustain Intermediate Representation; contents still Archify JSON v1) gives it its own extension, so a custom editor no longer hijacks `*.json`. How should the viewer be hosted?

## Considered Options

* Keep the singleton `WebviewPanel`
* A `CustomReadonlyEditorProvider` on `*.sir`, one viewer per tab
* A custom editor on `*.sir` that forwards to the single panel
* A `CustomTextEditorProvider` on `*.sir`

## Decision Outcome

Chosen option: "A `CustomReadonlyEditorProvider` on `*.sir`, one viewer per tab", because opening any `.sir` file (Explorer, Quick Open, file dialog) then shows the diagram in a normal editor tab, several diagrams can be open at once, and the viewer never edits the file.

* The validator publishes `draft.json` → `.archify/<run>/candidate.sir` (temp + rename, draft deleted); its output field `candidate` and the change map's `previous` name that file. Contents are unchanged.
* `contributes.customEditors`: view type `sustain.architecture`, "Sustain Architecture", selector `*.sir`, priority `default`; registered with `supportsMultipleEditorsPerDocument: true` and `retainContextWhenHidden: false`. `configurationDefaults` adds `files.associations: {"*.sir": "json"}` so "Reopen Editor With… → Text Editor" shows JSON.
* `src/extension/viewer.ts` replaces `panel.ts`: an `ArchitectureViewer` per tab, `ArchitectureEditorProvider`, and `showViewer(file, …)`, which reveals and reloads an open viewer of that file (preferring one in the requested column) or opens a new non-preview tab with `vscode.openWith`. New tabs open in `ViewColumn.Active` when no text editor is visible, else `Beside`; cited code still opens in the other column.
* The tab title is the file name (`candidate.sir`; VS Code adds the run folder as description when names collide). `Architecture: <meta.title>` is gone.
* `Sustain: Open Architecture` opens the newest `candidate.sir` of the chosen folder. `Sustain: Open Architecture File…` and its "Browse…" are removed; the Explorer and Quick Open replace them.
* The repo root of a viewed file is `<R>` for `<R>/.archify/<run>/<name>`, else its workspace folder, else its folder.
* The baseline belongs to the tab (each `WebviewPanel`), even when the same file is open in two groups. "Open baseline" opens or reveals the baseline's own tab in the same group, with that file's default baseline; "Swap" does the same but sets that tab's baseline to the file you came from. The current tab stays.
* The watcher applies each change to every open viewer: its file changed → reload, keeping the viewport; deleted → the tab stays with "This diagram was deleted."; its baseline changed → re-send the comparison; baseline deleted → drop it with one status-bar message. A created file that becomes its folder's newest and that no viewer shows opens, with `preserveFocus`, in the editor group of an open viewer of the same folder (a visible one first), leaving the old tab open; with no such viewer an info notification "New architecture diagram: `<run folder>`" offers "Open".
* Clean cutover: only `candidate.sir` is read (discovery, watcher, baseline picker, change map). Old `candidate.json` runs are ignored, and an update run on such a repo regenerates with reason `no-previous`. Repos with an older installed skill must re-run `Sustain: Install Agent Skills`; there is no staleness detection.
* The e2e hook reports `viewers(): {file, baseline, active, title}[]`, and `postFromWebview(file, message)` targets a viewer of `file`.

### Consequences

* Good, because diagrams open like any file and several can be compared side by side in tabs.
* Good, because the open-file picker, "Browse…" and the panel's own file tracking are gone.
* Good, because the JSON text editor is still one "Reopen Editor With…" away.
* Bad, because existing `.archify` runs with `candidate.json` are no longer shown and need a new run.
* Bad, because repos with an older installed skill keep writing `candidate.json` until the skill is re-installed.
* Bad, because the tab title no longer shows `meta.title`.

### Confirmation

e2e suites `single.view`, `watch`, `compare` and `navigate` drive the custom editor through `viewers()` and `postFromWebview(file, message)`; unit tests in `watchLogic.test.ts` cover `viewerAction` and `newRunAction`.

## Pros and Cons of the Options

### Keep the singleton `WebviewPanel`

* Good, because it needs no change.
* Bad, because diagrams cannot be opened from the Explorer and only one is shown at a time.

### Custom readonly editor on `*.sir`

* Good, because VS Code owns tabs, groups, Quick Open and the file dialog.
* Bad, because every tab is its own webview, so baselines and watcher reactions are per tab.

### Custom editor forwarding to the single panel

* Good, because files open from the Explorer while one view remains.
* Bad, because the opened editor tab must be closed or left empty, which is confusing.

### Custom text editor on `*.sir`

* Good, because VS Code keeps a text document with undo and save.
* Bad, because the viewer is read-only, so a text document adds dirty state it never uses.
