---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Straight clipped edges in authored mode; overlay rectangles for overlapping boundaries

## Context and Problem Statement

ELK can nest boundaries only as a tree and routes edges only for graphs it lays out. Two cases fall outside that: diagrams with authored positions for every component (no ELK run), and boundaries whose member sets partially overlap or equal another boundary's (no tree). The prototype routed authored edges with its own orthogonal router and rejected overlapping boundaries at load. How does Sustain draw these cases (FR-LAY-03, FR-LAY-04)?

## Decision Drivers

* No hand-written router (ADR 0010).
* The viewer never rejects a file it can draw (ADR 0012).
* Authored layouts must look like their authors placed them.

## Considered Options

* Straight centre-to-centre segments clipped to the box borders; overlapping or equal boundaries drawn as padded rectangles around their members, outside the ELK hierarchy
* Run ELK with fixed node positions to route authored edges; drop overlapping boundaries
* Port the prototype's orthogonal router

## Decision Outcome

Chosen option: "Straight clipped segments; overlay rectangles", because both are a few lines of geometry, need no router, and draw every boundary the file contains.

Geometry (src/layout/):

* **Authored edges** (`edges.ts › straightEdge`): from the centre of `from` to the centre of `to`, clipped to each border with `t = min(w/2/|dx|, h/2/|dy|)`; coincident centres give a zero-length segment.
* **Self-loops** (both modes, never sent to ELK; `selfLoop`): `(right, cy−10) → (right+16, cy−10) → (right+16, cy+10) → (right, cy+10)`, arrowhead at the last point. 16 px stays inside the 20 px compound padding below.
* **Label anchor** (`labelAnchor`): midpoint of the longest segment, the first on ties; only for connections with a label.
* **Compound boundaries** (auto mode, placed in the ELK hierarchy): ELK padding top 36 px (room for the label), left/right/bottom 20 px.
* **Overlay boundaries** (auto mode, partial overlap or equal set with a placed one): members' bounding box + 16 px on every side, `nested: false`.
* **Authored boundaries**: members' bounding box plus the rectangles of boundaries whose smallest strict superset is this one, padded 30 px left/top/right and 50 px bottom (prototype `boundaries.rs`).
* `Scene.boundaries` are ordered by area, largest first, so containers are drawn under their contents.

### Consequences

* Good, because every boundary and connection in a file is drawn.
* Good, because authored diagrams keep their exact node positions.
* Bad, because straight authored edges can cross other nodes; the 12 % node fill (FR-VIEW-05) leaves them visible underneath.
* Bad, because overlay rectangles can overlap other boxes that are not members.

### Confirmation

`test/unit/layout/edges.test.ts` (clipping, self-loop, label anchor), `test/unit/layout/boundaries.test.ts` (hierarchy, overlay, authored padding), `test/unit/layout/fixtures.test.ts` (edge ends on box borders, members inside their boundaries, for all 24 fixtures in both modes).

## Pros and Cons of the Options

### Straight segments and overlay rectangles

* Good, because it is simple and deterministic.
* Bad, because authored edges ignore the file's own routing hints (by design, FR-LAY-04).

### ELK with fixed positions; drop overlaps

* Good, because authored edges would be orthogonal.
* Bad, because ELK's fixed-position support (`interactive` layered) still moves nodes between layers, and dropping boundaries hides data.

### Port the prototype router

* Good, because it matches the prototype's look.
* Bad, because it is a large port that ADR 0010 chose to avoid.

## More Information

Deviation from the prototype (`boundaries.rs › nesting`): there, the earlier of two boundaries with equal member sets became the parent of the later one. Here only strict supersets nest, in line with FR-LAY-03, which treats equal sets like partial overlaps.
