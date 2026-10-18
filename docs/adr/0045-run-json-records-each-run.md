---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# run.json records each run

## Context and Problem Statement

A run folder held only `draft.json` or `candidate.json`, so nothing told the extension what kind of run it was, how far it had got, or what it cost. Refresh, drill-down, the run card and the cost estimate all need that ([spec.md](../spec.md) §3 had ruled run logs out; spec v0.3 CST-04 brings them back).

## Considered Options

* A `run.json` sidecar in the run folder, written by `repo-facts.mjs` and updated by `validate.mjs` and the extension
* An append-only `run.jsonl` event log

## Decision Outcome

Chosen option: "A `run.json` sidecar in the run folder, written by `repo-facts.mjs` and updated by `validate.mjs` and the extension", because readers need the current state, not the history, and one small JSON object is what the run card and the estimator read.

`run.json` holds `schema: 1`, `kind`, `focus`, `paths`, `base`, `parent`, `createdAt`, `skillVersion`, `phase` (`created`, `validating`, `accepted`, `rejected`), `attempts` and `finishedAt`. The extension adds `agent`, `mode`, `tokens` and `costUsd` when it knows them. Writes are atomic and confined to the repository.

### Consequences

* Good, because every later feature reads one shape.
* Bad, because a run folder is no longer just the diagram, and older tests that pinned its contents changed.
