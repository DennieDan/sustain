---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Record architecture decisions with MADR

## Context and Problem Statement

Sustain is built in a long-running, mostly autonomous implementation that spans many sessions. Decisions made by the owner in the design interview and by the implementer along the way must survive between sessions and stay auditable. Which format do we use, and what must be recorded?

## Decision Drivers

* Every session resumes from files alone ([spec §9](../spec.md)).
* The owner reviews decisions after the fact and must see the rejected options.
* A record must be machine-checkable so drift is caught by `npm run check`.

## Considered Options

* MADR 4.0 with YAML front matter, checked by `npm run check:docs`
* Nygard-style ADRs (Context / Decision / Consequences)
* No ADRs; decisions only in the spec and the progress log

## Decision Outcome

Chosen option: "MADR 4.0 with YAML front matter, checked by `npm run check:docs`", because it records the considered options and consequences in a fixed shape that a script can verify.

The rules are FR-DOC-03: files `docs/adr/NNNN-<kebab-case-title>.md` numbered from 0001 without gaps; front matter `status`, `date`, `decision-makers` (`owner` or `implementer`); required sections; [`README.md`](README.md) indexes every ADR; accepted ADRs are only edited to change `status`, changes get a new ADR that supersedes the old one. [`template.md`](template.md) is the unmodified MADR 4.0 template. The decisions of spec §5 are seeded as ADRs 0002–0015.

### Consequences

* Good, because the reasoning behind every structural choice is preserved across sessions.
* Good, because `check:docs` fails the build on missing sections, numbering gaps, stale index rows and broken links.
* Bad, because each decision costs a file and an index row.

### Confirmation

`scripts/check-docs.mjs` (run by `npm run check:docs`, part of `npm run check`) and `test/unit/checkDocs.test.ts`.

## Pros and Cons of the Options

### MADR 4.0 with YAML front matter

* Good, because considered options and consequences are mandatory sections.
* Good, because front matter makes status and date machine-readable.
* Bad, because it is more verbose than Nygard's format.

### Nygard-style ADRs

* Good, because they are short.
* Bad, because they have no place for rejected options.

### No ADRs

* Good, because there is no overhead.
* Bad, because the spec's decision table would be the only record and implementer decisions would be lost between sessions.

## More Information

MADR 4.0: https://adr.github.io/madr/. The spec's decision record (§5) summarises ADRs 0002–0015; after M0 the ADRs are authoritative.
