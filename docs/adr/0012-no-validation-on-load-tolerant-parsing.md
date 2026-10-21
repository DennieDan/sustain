---
status: superseded by [ADR-0048](0048-maps-show-staleness-from-fingerprints.md)
date: 2026-10-10
decision-makers: owner
---

# No validation on load; tolerant parsing; stale citations reported on click

## Context and Problem Statement

Candidates were validated when published (ADR 0008), but files can be hand-edited, come from Archify directly, or cite code that has since changed. What does the viewer do with imperfect input?

## Considered Options

* No validation on load; tolerant parsing that skips unusable parts; citations checked only when clicked
* Full schema and citation validation on load, with a problems list
* Refuse to open anything that fails the schema

## Decision Outcome

Chosen option: "No validation on load; tolerant parsing that skips unusable parts; citations checked only when clicked", because showing as much of the diagram as possible is more useful than reporting problems the user cannot act on in the viewer.

Rules are FR-VIEW-03 (tolerant parse) and FR-NAV-03 (stale references).

### Consequences

* Good, because any roughly valid Archify file can be viewed.
* Good, because opening is fast; no file system checks happen until a click.
* Bad, because a stale citation is only discovered when clicked.

### Confirmation

FR-VIEW-03 unit tests (one per rule, all fixtures parse with no skips); FR-NAV-03 e2e tests.

## Pros and Cons of the Options

### Tolerant parse, check on click

* Good, because it degrades gracefully.
* Bad, because silent skips can hide malformed parts of a file.

### Full validation on load

* Good, because users see every problem.
* Bad, because it brings back a problems list, which is a non-goal (spec §3).

### Refuse on schema failure

* Good, because only clean data is shown.
* Bad, because one stray field would block the whole diagram.
