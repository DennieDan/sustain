---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Tours are a sidecar the viewer plays

## Context and Problem Statement

Spec v0.3 SKL-02 adds guided tours: ordered stops that each open a box's code, explain it and ask a question. Tours are committed with the map, and the cloud plays them on map pages. The Archify format stays unchanged. Where does a tour live, what does it hold, and who plays it?

## Considered Options

* A `tour.json` sidecar beside the map, written by a recorder script and played by the shared viewer
* Tour fields inside `candidate.json`
* A tour kept in the extension's storage

## Decision Outcome

Chosen option: "A `tour.json` sidecar beside the map, written by a recorder script and played by the shared viewer", because the map stays valid Archify, the tour travels with it in git, and every host gets the same player.

* `.archify/<run>/tour.json` is `{schema: 1, createdAt, stops}` with 4 to 12 stops. Each stop holds `component`, a box of the map, `title` (at most 100 characters), `explanation` (at most 400), `question` (at most 300), `answer` (at most 400) and `citation` `{path, line, end_line?}`. Extra fields are refused.
* The `sustain-tour` skill writes `tour-draft.json`. `tour-record.mjs` checks it against `tour.schema.json`, the map's boxes and the citation rules of a map citation, then writes `tour.json` and removes the draft.
* The viewer plays the tour it is sent. Each stop marks its box and posts `tourStop`, and VS Code opens the cited lines beside the map. The answer shows only when asked.
* `sustain.mjs publish` uploads `tour.json` as the `tour` sidecar, under the same closed schema and secret scan as the other sidecars. The cloud's map page plays it, and a stop's citation opens on GitHub at the map's commit.

### Consequences

* Good, because a team reviews and versions its tours with the map.
* Bad, because a tour goes stale with its map. Refreshing the map leaves the old tour in the old run folder.

### Confirmation

`test/unit/agent/tourRecord.test.ts` checks the recorder, `test/dom/main.test.ts` › SKL-02 the player, and `test/e2e/suite/single.tour.test.ts` that playing opens each stop's code beside the map.
