---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Validator and repo facts as dependency-free Node bundles

## Context and Problem Statement

The skill's scripts run in the user's repository, outside the extension, invoked by the agent with `node`. They share schema, checks and citation rules with the extension's model code. In what language and form do they ship?

## Considered Options

* Dependency-free `.mjs` bundles built from the extension's TypeScript (`esbuild`, ESM, platform node, target node18, all dependencies inlined)
* A Python script
* A separate npm package installed with `npx`

## Decision Outcome

Chosen option: "Dependency-free `.mjs` bundles built from the extension's TypeScript", because the validator then shares one implementation with `src/model/`, needs no install step, and Node ≥ 18 is already present wherever these agents run.

### Consequences

* Good, because one TypeScript model serves the extension, the webview and the scripts.
* Good, because the bundles work offline with nothing but `node`.
* Bad, because the bundles must avoid APIs newer than Node 18.
* Bad, because Ajv and the schemas are duplicated into each bundle (size, not correctness).

### Confirmation

FR-VAL-01 and FR-RF-01 unit tests execute `dist/skills/sustain-architecture/scripts/*.mjs` with `node` as child processes.

## Pros and Cons of the Options

### Dependency-free `.mjs` bundles from TypeScript

* Good, because there is a single source of truth.
* Bad, because bundling adds a build step.

### Python script

* Good, because Python is common.
* Bad, because the model would be implemented twice.

### npm package via `npx`

* Good, because it can be updated independently.
* Bad, because `npx` downloads from the network and needs a published package.
