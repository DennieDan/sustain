---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Validator owns geometry, presentation and repository metadata

## Context and Problem Statement

Archify JSON carries geometry (`pos`, `size`, grid cells, routing hints) and presentation fields (`views`, `animation`, `icon`, ...) next to topology. An agent placing boxes blind produces poor layouts, and an agent guessing `meta.repository` may cite the wrong revision. Which fields may the agent author?

## Considered Options

* The validator strips agent-authored geometry/presentation fields with a warning and sets `meta.repository`/`meta.output` (and the fixed root/meta values) itself
* Reject drafts that contain those fields
* Accept whatever the agent writes

## Decision Outcome

Chosen option: "The validator strips agent-authored geometry/presentation fields with a warning and sets `meta.repository`/`meta.output` itself", because removals cost the agent no repair round, while layout is computed by the viewer (ADR 0010) and repository facts come from git.

The exact field list is FR-VAL-02, ported from the prototype's submission gate.

### Consequences

* Good, because geometry is consistent and repository links point at the real HEAD.
* Good, because repairs are spent only on real errors.
* Bad, because a hand-authored layout passed through the validator loses its positions.

### Confirmation

FR-VAL-02 unit test: a draft with every removable field is accepted, the candidate contains none of them, and warnings list every pointer.

## Pros and Cons of the Options

### Strip with warnings, set app-owned values

* Good, because it is forgiving and deterministic.
* Bad, because silently correcting may hide agent mistakes (mitigated by warnings).

### Reject

* Good, because the agent learns the rules.
* Bad, because it burns limited repair rounds (FR-SKL-02) on cosmetic fields.

### Accept anything

* Good, because it is simplest.
* Bad, because poor authored geometry would be shown and repository metadata could be wrong.
