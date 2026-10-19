---
status: superseded by [ADR-0033](0033-custom-editor-for-sir-files.md)
date: 2026-10-10
decision-makers: owner
---

# WebviewPanel viewer with code in the other column

## Context and Problem Statement

The prototype had a three-pane window with a tree, a diagram and its own source viewer. VS Code already has editors. Where does the diagram live, and where does the cited code open?

## Considered Options

* A `WebviewPanel` in an editor column; code opens in VS Code editors in the other column
* A webview view in the sidebar or panel area
* A custom editor bound to `candidate.json`

## Decision Outcome

Chosen option: "A `WebviewPanel` in an editor column; code opens in VS Code editors in the other column", because a diagram needs editor-sized space and side-by-side code lets users compare node and source without losing either.

One panel per window (FR-VIEW-04); navigation in FR-NAV-02.

### Consequences

* Good, because users read code in real editors with all their tooling.
* Good, because no source viewer has to be built (spec §3).
* Bad, because the panel competes with editors for columns.

### Confirmation

FR-VIEW-04 and FR-NAV-02 e2e tests assert the panel and the editor's view column.

## Pros and Cons of the Options

### WebviewPanel in an editor column

* Good, because it gets editor-sized space and can sit beside code.
* Bad, because it is not tied to a file, so the extension tracks what it shows.

### Webview view in sidebar/panel

* Good, because it does not occupy an editor column.
* Bad, because sidebars are too narrow for architecture diagrams.

### Custom editor for `candidate.json`

* Good, because opening the file opens the diagram.
* Bad, because it replaces the JSON text editor for that file and complicates "open newest".
