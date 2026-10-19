---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Navigation and watching details

## Context and Problem Statement

FR-NAV-01..03 and FR-WAT-01 fix the click rules, messages, columns and watcher events. Implementing them required choices the spec leaves open: when the extension activates so it can watch, what "a new candidate" means for debounced events, how odd line values are treated, and what "no selection" means in an editor that remembers its last selection.

## Decision Drivers

* Watching must work before the user runs any Sustain command (the agent may be started outside VS Code).
* Clicks must never throw on hand-edited line values.
* Keep every §7 string verbatim (ADR 0021).

## Considered Options

* Activate on `onStartupFinished`; the rules below
* Activate on `workspaceContains:.archify/*/candidate.json` and on commands only

## Decision Outcome

Chosen option: "Activate on `onStartupFinished`; the rules below", because a repository without `.archify/` yet would otherwise not be watched when its first candidate appears, and activation after startup does not delay the window.

Watching (src/extension/watcher.ts, watchLogic.ts):

* One `FileSystemWatcher` per workspace folder on `RelativePattern(folder, ".archify/*/candidate.sir")`, added and removed with the folders.
* Events are batched per file and flushed 300 ms after the last event; a file counts as created if any batched event was a creation. At flush, existence and the folder's newest candidate (FR-VIEW-02) are read from disk.
* Since [ADR 0033](0033-custom-editor-for-sir-files.md) each change applies to every open viewer tab: its file changed → `reload()` (same file, so the webview keeps its viewport); deleted → the tab stays with the empty state "This diagram was deleted." without a notification.
* A created file that is now the folder's newest and that no viewer shows: if a viewer of that folder is open (a visible one first), the new run opens in that viewer's editor group with `preserveFocus`, leaving the old tab open; otherwise "New architecture diagram: `<run folder>`" with "Open". (Before ADR 0033 the single panel switched to it instead.)

Navigation (src/extension/navigate.ts, sourceTarget.ts):

* Lines are used only when `line` is a positive integer; `end_line` below `line` (or not a positive integer) selects just `line`; `end_line` without `line` opens at the top.
* Stale-line message: "Stale reference: `<path>` has N lines; the diagram cites L–E", with just "L" when there is no `end_line`. N follows the validator's count (a trailing newline is not an extra line).
* A symlink whose real path leaves the root counts as "Invalid source path". Binary, oversized or unreadable files are opened without a line check (they exist; the editor reports what it can show).
* A selection spans from the start of `line` to the end of `end_line`. Without lines, the cursor is set to 1:1 and the top revealed, because VS Code otherwise restores the document's previous selection.
* The highlight is a whole-line decoration type using `editor.rangeHighlightBackground`, disposed after 2 s.
* Status bar text for components without sources: "`<label>` has no source references" for 3 s.

### Consequences

* Good, because new diagrams are noticed even in repositories that had none.
* Bad, because the extension is activated in every window, including those that never show a diagram (one watcher per folder, no other work).

### Confirmation

`test/unit/extension/watchLogic.test.ts`, `test/unit/extension/sourceTarget.test.ts`, `test/e2e/suite/single.watch.test.ts`, `test/e2e/suite/single.navigate.test.ts`, `test/dom/click.test.ts`.

## Pros and Cons of the Options

### `onStartupFinished`

* Good, because watching always works.
* Bad, because the extension loads in windows that never use it.

### `workspaceContains` and commands

* Good, because the extension loads only where diagrams exist or are requested.
* Bad, because the first candidate of a repository is missed unless a Sustain command ran in that window.
