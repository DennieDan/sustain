---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Archify JSON v1 and the .archify folder layout

## Context and Problem Statement

Sustain needs an on-disk diagram format and a place to keep runs. The prototype used Archify JSON v1 (`schema_version: 1`, `diagram_type: "architecture"`) in `.archify/architecture-<slug>-<timestamp>/`. Do we keep it?

## Considered Options

* Archify JSON v1 and the prototype's `.archify/` layout, unchanged
* A Sustain-specific JSON format
* Archify JSON stored in an extension-owned location (global storage)

## Decision Outcome

Chosen option: "Archify JSON v1 and the prototype's `.archify/` layout, unchanged", because existing Archify diagrams and prototype runs open without conversion, and runs live next to the code they describe.

Schemas are vendored byte-for-byte (spec §6); run folders are `.archify/architecture-<slug>-<YYYYMMDD-HHMMSS>[-N]/` holding `draft.json` or `candidate.json`.

### Consequences

* Good, because Archify, the prototype and Sustain read the same files.
* Good, because runs can be committed or ignored by the user like any other file.
* Bad, because Archify v1 has no content hashes, so moved lines are not detected (spec §3).

### Confirmation

FR-MOD-01/02 unit tests round-trip and validate all 24 vendored fixtures; FR-VIEW-02 tests the run-folder naming.

## Pros and Cons of the Options

### Archify v1 unchanged

* Good, because it is compatible with existing material.
* Bad, because presentation fields Sustain ignores remain in the format.

### Sustain-specific format

* Good, because it could add hashes and drop unused fields.
* Bad, because converters would be needed in both directions.

### Extension-owned storage

* Good, because the repository stays untouched.
* Bad, because diagrams could not be shared, committed or produced by an agent working in the repo.
