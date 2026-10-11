---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Auto layout direction chosen by fit scale

## Context and Problem Statement

Archify JSON has no layout direction. A left-to-right layered drawing suits long pipelines in a wide panel; top-to-bottom suits deep hierarchies or narrow panels. FR-LAY-02 says to run both and keep the one with the larger fit-to-viewport scale. How exactly are the runs set up and scored?

## Considered Options

* Lay out RIGHT and DOWN with identical ELK input, score each finished Scene by `min(viewport.width / bounds.w, viewport.height / bounds.h)` including the 40 px margin, pick DOWN only if strictly larger
* Always RIGHT
* Pick by the graph's shape (depth vs. breadth) without running ELK twice

## Decision Outcome

Chosen option: "Lay out both, score the finished Scene, ties to RIGHT", because the score is exactly what the user sees after "Fit", and the shape heuristics cannot account for node sizes or boundaries.

Details (src/layout/layout.ts, elk.ts):

* Both runs use the same freshly built ELK graph (ELK mutates its input) and run concurrently with `Promise.all` on one `ELK` instance from `elkjs/lib/elk.bundled.js`.
* `org.eclipse.elk.json.shapeCoords` and `edgeCoords` are `ROOT`, so nested nodes and edge sections come back in absolute coordinates. All edges are attached to the root graph. ELK ids are `n<i>`, `b<i>`, `e<i>` so document ids cannot clash.
* Spec options are set on the root and repeated on every compound node (ELK reads spacing per graph); `hierarchyHandling: INCLUDE_CHILDREN` on the root only; root padding 0.
* Each result is translated so the drawing's top-left is at (40, 40); `bounds` is the drawing box plus 40 px on every side, so auto bounds start at (0, 0).
* The viewport is the panel's current size in the webview (`svg.getBoundingClientRect()`), 1600×1000 in tests.

### Consequences

* Good, because wide diagrams in wide panels and deep diagrams in tall panels both fill the view.
* Bad, because every auto layout costs two ELK runs (about 200 ms for 60 components / 120 connections in Node, NFR-PERF-01).
* Bad, because resizing the panel does not re-run the choice until the next load.

### Confirmation

`test/unit/layout/edges.test.ts` › `FR-LAY-02 direction choice` (wide chain → RIGHT, portrait viewport → DOWN, very wide boxes → DOWN, ties → RIGHT); `test/unit/layout/fixtures.test.ts` › `… lays out identically twice` (determinism); `test/unit/layout/perf.test.ts`.

## Pros and Cons of the Options

### Score both runs

* Good, because the decision uses real geometry.
* Bad, because it doubles layout time.

### Always RIGHT

* Good, because it is fastest.
* Bad, because deep diagrams become tiny in a wide panel.

### Shape heuristic

* Good, because it needs one run.
* Bad, because node widths and compound padding change which direction fits better.
