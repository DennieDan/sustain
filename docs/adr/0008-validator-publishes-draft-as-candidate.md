---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Validator publishes draft.json as candidate.json

## Context and Problem Statement

The viewer must only pick up diagrams that passed validation, but it does not validate on load (ADR 0012). The agent writes the diagram itself. How does a validated diagram become visible to the viewer?

## Considered Options

* The agent writes `draft.json`; `validate.mjs` moves it to `candidate.json` on success, failed runs keep `draft.json`
* The agent writes `candidate.json` directly; the viewer validates
* The validator writes `candidate.json` and keeps `draft.json`

## Decision Outcome

Chosen option: "The agent writes `draft.json`; `validate.mjs` moves it to `candidate.json` on success, failed runs keep `draft.json`", because only accepted diagrams ever exist under the name the viewer and watcher look for.

The write is atomic (temp file + rename); the draft is deleted afterwards (FR-VAL-06).

Since [ADR 0033](0033-custom-editor-for-sir-files.md) the published file is named `candidate.sir` (same contents); the rule is unchanged.

### Consequences

* Good, because the viewer can trust that `candidate.json` passed validation when it was published.
* Good, because a failed run leaves the draft for inspection.
* Bad, because an agent that skips the validator produces no visible diagram (mitigated by skill wording, spec §12).

### Confirmation

FR-VAL-06 unit tests: an accepted run leaves only `candidate.json`; a rejected run leaves only `draft.json`, byte-identical.

## Pros and Cons of the Options

### Draft moved to candidate on success

* Good, because publication is a single atomic step.
* Bad, because the file name changes between agent and viewer.

### Agent writes `candidate.json` directly

* Good, because it is simpler for the agent.
* Bad, because the viewer would show unvalidated diagrams or need its own validator.

### Validator writes candidate and keeps draft

* Good, because the agent's original remains.
* Bad, because two near-identical files per run confuse users and agents.
