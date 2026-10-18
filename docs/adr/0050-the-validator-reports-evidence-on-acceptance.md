---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# The validator reports evidence on acceptance

## Context and Problem Statement

A box can cite only a class or function signature. The citation is valid, so the validator accepts it, but it shows that code exists, not what it does, and the map then names things rather than explaining them. Spec v0.3 ACC-01 asks for behaviour over names and a way to point the agent at such boxes without rejecting the map.

## Considered Options

* An `evidence` list on an accepted report, with `evidence.json` beside the candidate, reviewed once
* A new rejection rule

## Decision Outcome

Chosen option: "An `evidence` list on an accepted report, with `evidence.json` beside the candidate, reviewed once", because a declaration-only box is a weak map rather than a broken one, and a heuristic must not block acceptance.

* This extends the report of [ADR 0017](0017-validator-output-contract-and-exit-codes.md) with `evidence` on accepted reports. Exit codes and every other key stay as they were.
* `DeclarationOnly` marks a box whose every citation is at most 3 lines that only declare something: no call outside a function's own signature, no return, await or throw.
* The skill reviews the list once. A revised `draft.json` in the same run folder is validated as usual, and its acceptance replaces the candidate and its sidecars. It does not count against the three repairs.

### Consequences

* Good, because the agent gets one concrete prompt to cite behaviour, and the user's map improves without a failed run.
* Bad, because the heuristic reads text, not syntax, and can miss or misjudge a citation. It only asks for a review.
