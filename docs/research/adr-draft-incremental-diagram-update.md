---
status: proposed
date: 2026-10-19
decision-makers: owner
---

# Update the previous diagram incrementally instead of regenerating it

Draft for Gate 3. It stays out of `docs/adr/` until the owner accepts it; it would then become the next numbered ADR.

## Context and Problem Statement

Sustain's skill draws every diagram from scratch. Two runs at the same commit share few component IDs and no connection IDs, so Archify's ID-based `compare` shows noise instead of the code change. The [change collection study](change-collection-report.md) measured this: a fresh regeneration produces a median of 47 spurious diff entries against an earlier diagram of the *same* commit, and keeps only half of the IDs of unchanged components. How should Sustain produce the diagram of a newer commit when a previous diagram exists?

## Decision Drivers

* The diff between two diagrams should show the code change and nothing else (identity and abstraction stability).
* Hand corrections to a diagram must survive later updates.
* Errors must not pile up across updates.
* No LLM or network code in the extension ([ADR 0002](../adr/0002-external-coding-agent-generates-diagrams.md)); only the external agent and deterministic scripts bundled with the skill.
* Lower cost per update is a tie-breaker.

## Considered Options

* S0: regenerate from scratch (today's behaviour)
* S1: regenerate with the previous diagram as a hint to reuse IDs
* S2: patch the previous diagram from the change description
* S3: regenerate, then match IDs to the previous diagram with a deterministic script
* S4: a script maps the diff to the components whose cited files it touches; the agent re-explores only those components and the uncited changed files and patches the previous diagram

## Decision Outcome

Chosen option: "S4", because it is the only option that met all six criteria of the study's decision rule on pooled data from three repositories, and it is the cheapest.

| Measure (Stage 2, 39 pairs) | S4 with diff hunks grouped by component | S0 |
|---|---|---|
| ID retention of unchanged components | 1.00 | 0.50 |
| Spurious diff entries, same commit | 0 | 47 |
| Labelled architectural changes missed | 0.00 (median) | 0.00 |
| Hand corrections kept | 158 of 159 | – |
| Acceptance rate | 0.998 | 1.000 |
| Median cost per run | $0.32 | $0.53 |

The skill gets an update mode used whenever a previous candidate of the same scope exists:

1. A new bundled script (beside `repo-facts.mjs` and `validate.mjs`) takes the previous candidate and the commit it was drawn at, runs `git diff` to the current checkout, and writes the change grouped by component plus the list of changed files no component cites.
2. The skill tells the agent to re-explore only the touched components and the uncited files, patch the previous diagram, keep everything else with its IDs, and give every connection a unique `id`.
3. The validator then runs as today.
4. A full regeneration (today's flow) runs when no previous candidate exists, when the user asks for it, and after a fixed number of incremental updates (proposed: 5), followed by ID matching to the last diagram.

### Consequences

* Good, because diagram diffs show code changes: an unchanged commit yields an empty diff, and IDs of unchanged components stay put.
* Good, because hand edits to the diagram survive updates (99 % in the study).
* Good, because an update costs about 40 % less and finishes about 30 % faster than a regeneration.
* Bad, because patches miss changes that do not touch any cited file: the study's three planted package moves were missed by every patch run, and one of three planted responsibility moves.
* Bad, because patched diagrams grow over many updates (median 15 → 19 components over 10 steps on one repository, while fresh diagrams stayed at 15); the periodic full regeneration in step 4 is the mitigation.
* Bad, because the study's judges could not measure stale claims, so error accumulation is not shown to be absent, only unmeasured.
* Neutral, because the extension itself does not change: the skill and its scripts do.

### Confirmation

The study's harness (`research/change-collection/harness/`) can re-run the same pairs and chains against the shipped skill. Acceptance check for the implementation: on the study's same-commit pairs the update mode yields 0 spurious diff entries, and on the planted pairs it reports the component, responsibility and connection plants.

## Proposed changes to the product spec

Under the product spec's §10 these need owner approval:

* §3 Non-goals: remove "A `sustain-architecture-refresh` skill. Re-run the skill instead."
* Add a requirement for the update mode (steps 1–4 above), including the rule for when a full regeneration runs.
* Add the change-mapping script to the skill's file list next to `repo-facts.mjs` and `validate.mjs`.
* Require a unique `id` on every connection in the skill's format reference (the study's one change to the frozen skill).

## More Information

* Report: [change-collection-report.md](change-collection-report.md); specification: [change-collection-spec.md](change-collection-spec.md).
* Open follow-ups from the study: a boundary-aware change mapper (package and directory moves of cited files), and a redesign of the role and claim judges.
