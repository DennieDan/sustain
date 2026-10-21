---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Maps show staleness from fingerprints on load and on change

## Context and Problem Statement

[ADR 0012](0012-no-validation-on-load-tolerant-parsing.md) parsed maps tolerantly and found a stale citation only when it was clicked. A map that silently drifts from the code loses trust, and a moved block opened at the wrong lines. Spec v0.3 FRS-01 to FRS-03 record fingerprints at acceptance and show freshness on the map.

## Considered Options

* Compare each citation with its fingerprint on load and whenever a cited file changes
* Keep checking on click only

## Decision Outcome

Chosen option: "Compare each citation with its fingerprint on load and whenever a cited file changes", because the comparison is cheap and the user sees drift before acting on it.

* Parsing stays tolerant, as ADR 0012 decided.
* `validate.mjs` writes `fingerprints.json` at acceptance. `src/model/staleness.ts` classifies each citation as fresh, moved, edited or missing, and a box takes its worst.
* The extension watches every workspace folder and editor saves. A change to a cited file clears that map's cached result and, after 300 ms, the map, the maps list and the status bar update.
* Edited boxes are badged "changed" and missing ones "missing". A header counts them since the map's revision. A moved citation opens at its new lines.
* A map without fingerprints shows no badges, as before.

### Consequences

* Good, because drift is visible on the map and in the status bar.
* Bad, because every cited file is read and hashed when a map loads. The result is cached until a cited file changes.
