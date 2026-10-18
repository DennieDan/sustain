---
status: superseded by [ADR-0049](0049-a-refresh-skill-updates-a-map-from-its-fingerprints.md)
date: 2026-10-10
decision-makers: owner
---

# One skill with bundled repo-facts and validate scripts

## Context and Problem Statement

The agent needs instructions (how to explore, what to write), facts it cannot reliably compute itself (run folder name, git revision), and a validator equivalent to the prototype's submission gate. How is this packaged?

## Considered Options

* One skill, `sustain-architecture`, bundling `scripts/repo-facts.mjs` and `scripts/validate.mjs`
* One skill with instructions only; the agent validates by reading the format reference
* Two skills: `sustain-architecture` and `sustain-architecture-refresh`

## Decision Outcome

Chosen option: "One skill, `sustain-architecture`, bundling `scripts/repo-facts.mjs` and `scripts/validate.mjs`", because deterministic scripts give the agent exact facts and exact, pointer-addressed errors, and one skill is enough: refreshing a diagram is re-running the skill.

### Consequences

* Good, because validation is deterministic and identical for every agent.
* Good, because the agent's repair loop is driven by JSON pointers (FR-VAL-01).
* Bad, because the skill requires Node ≥ 18 on the user's machine (ADR 0007).
* Bad, because there is no incremental refresh; a re-run regenerates the whole diagram.

### Confirmation

FR-SKL-01/02 unit tests on the skill files; FR-VAL-* and FR-RF-01 unit tests run the built `.mjs` scripts.

## Pros and Cons of the Options

### One skill with bundled scripts

* Good, because the skill is self-contained once installed.
* Bad, because the scripts must be built and shipped with the extension.

### Instructions only

* Good, because there is nothing to execute.
* Bad, because agents cannot reliably check citations, line counts or schema rules by reading.

### Two skills

* Good, because a refresh skill could patch an existing diagram.
* Bad, because it doubles the instructions to maintain and adds a second invocation to learn.
