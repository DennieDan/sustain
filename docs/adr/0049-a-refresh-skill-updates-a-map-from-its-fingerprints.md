---
status: superseded by [ADR-0066](0066-units-with-one-way-import-rules.md)
date: 2026-10-18
decision-makers: implementer
---

# A refresh skill updates a map from its fingerprints

## Context and Problem Statement

[ADR 0004](0004-one-skill-with-bundled-scripts.md) shipped one architecture skill, so bringing a map up to date meant generating it again from nothing. That repeats the whole exploration, costs a full run and changes box ids the user had learned. Spec v0.3 FRS-05 adds a refresh that re-examines only what changed.

## Considered Options

* A second skill, `sustain-refresh`, with its own facts script and the shared validator
* A refresh mode inside the architecture skill

## Decision Outcome

Chosen option: "A second skill, `sustain-refresh`, with its own facts script and the shared validator", because its steps differ from a first generation and a separate skill keeps each SKILL.md short.

* `refresh-facts.mjs --from <run> [--paths <glob>…]` reports the base map's revision and staleness, the files changed since then with line counts, which of them no box cites, and new top-level folders. Git runs as ADR 0041 and SAF-07 require.
* It creates a run folder named like any other, with `run.json` of `kind: "refresh"`, `base` and `paths`, and a `draft.json` copied from the base map without the fields the validator owns.
* The skill re-examines only edited and missing boxes, moved citations, uncovered changes and new folders, within `--paths` when given. It keeps unchanged ids and validates as usual.
* The build copies the architecture skill's format reference into the refresh skill and bundles `validate.mjs` into both.

### Consequences

* Good, because a refresh costs a fraction of a full run and keeps the map's ids stable.
* Bad, because there are now two skills to install and keep intact. Install, the integrity check and the hashes cover every shipped skill.
