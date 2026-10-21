---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# The Action updates the map only when asked

## Context and Problem Statement

ADR-0053 made the pull request check a JavaScript Action that never starts a program and so never calls an agent. Spec v0.3 PRC-05 adds an opt-in update: with candidates or stale boxes, the Action runs the refresh skill and commits the new map to the pull request's branch. That needs the Action to start the agent and git, and to push. Which runs may do that, and with what?

## Considered Options

* Start programs only in `action/src/refresh.ts`, behind the `refresh` input, on a same-repository pull request at its head
* A separate Action for the update
* Leave the update to a workflow step that calls the CLI

## Decision Outcome

Chosen option: "Start programs only in `action/src/refresh.ts`, behind the `refresh` input, on a same-repository pull request at its head", because one Action keeps one comment, and every other run stays as ADR-0053 left it.

* Everything ADR-0053 decided stands: the committed bundle, the check, the comment, `fail-on`, `comment`, `upload`, and the network only through `action/src/github.ts` and the cloud client.
* `action/src/refresh.ts` is the only file in `action/src/` that starts a program. It starts the agent and git, and only when `refresh` is `claude` or `codex`.
* It never runs for a pull request from a fork, nor without the agent's key, nor unless the pull request's head is checked out, nor when there is nothing to cover.
* The agent gets the sidebar's headless argv with no shell, in a fresh home holding only the refresh skill with hooks off, and an environment of only `PATH`, `HOME`, `LANG`, its home variable and its key. The workflow's token and other variables never reach it.
* Only the new run folder is committed, and it is pushed to the pull request's branch.

### Consequences

* Good, because a team can keep its map current from CI with one input.
* Bad, because a run spends tokens on the team's key and needs `contents: write` and the agent's CLI on the runner.

### Confirmation

`test/unit/actionRefresh.test.ts` checks the decision, the fork refusal and the exact argv and environment. `test/unit/noNetwork.test.ts` allows programs in `action/src/refresh.ts` alone. One real run is `[smoke]` (progress, Waiting).
