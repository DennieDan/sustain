---
status: superseded by [ADR-0064](0064-layout-runs-in-web-workers-from-blob-urls.md)
date: 2026-10-10
decision-makers: owner
---

# elkjs layout in the webview, authored positions when complete

## Context and Problem Statement

Agent-produced candidates have no geometry (ADR 0009), while existing Archify files often do. The prototype used a dagre port plus an in-house orthogonal router. How does Sustain place nodes, boundaries and edges?

## Considered Options

* elkjs (`layered`, orthogonal routing, compound nodes) in the webview; authored `pos`/`size` used only when every component has them
* dagre plus a custom router, ported from the prototype
* Always use authored geometry; reject diagrams without it

## Decision Outcome

Chosen option: "elkjs in the webview; authored `pos`/`size` used when every component has them", because ELK supports nested boundaries and orthogonal edge routing out of the box, and running it next to the renderer keeps the extension host free of layout work.

Mode and options are FR-LAY-01..04. If elkjs fails under the webview CSP, the fallback is layout in the extension host (spec §12, needs an ADR).

### Consequences

* Good, because nested boundaries and orthogonal routing come from a mature engine.
* Good, because hand-authored Archify layouts are shown as drawn.
* Bad, because elkjs adds roughly 1.5 MB to the webview bundle.
* Bad, because partial authored positions are ignored entirely.

### Confirmation

FR-LAY-* unit tests over all fixtures; NFR-PERF-01 timing test; `[manual]` CSP check in M3.

## Pros and Cons of the Options

### elkjs in the webview

* Good, because no router has to be written or ported.
* Bad, because the bundle is large and ELK's output must be trusted.

### dagre plus custom router

* Good, because it matches the prototype's look.
* Bad, because the router alone was hundreds of lines of Rust to port and maintain.

### Authored geometry only

* Good, because there is no layout engine.
* Bad, because agent output has no geometry, so nothing could be shown.
