---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# The pull request check runs as a JavaScript Action

## Context and Problem Statement

Spec v0.3 PRC-04 puts the delta report (PRC-01) on every pull request as one comment and a pass or fail result. How does it run in GitHub Actions, and how is it kept from reaching anything but GitHub?

## Considered Options

* A JavaScript action in `action/` whose bundle is committed
* A composite action that installs Node packages and runs the CLI
* A container action

## Decision Outcome

Chosen option: "A JavaScript action in `action/` whose bundle is committed", because it starts in seconds without an install step, and GitHub runs only what is in the repository.

* `action/action.yml` runs `dist/index.js` on Node 20. The bundle is built from `action/src/` and the same model modules as the CLI, and CI rebuilds it and fails when it differs from the committed file.
* On `pull_request`, it runs the check from `origin/<base_ref>` to `HEAD`, then posts or updates one comment that starts with `<!-- sustain-check -->`: the summary, touched boxes, new box candidates, stale and gone boxes, and a Mermaid flowchart with generated node ids and escaped labels. Each list stops at 30 items.
* `fail-on` sets the job result. `comment: false` skips the comment.
* Only `action/src/github.ts` uses the network, and only for GitHub's REST API with the workflow's token. Nothing in the Action starts a program, so it never calls an agent. `upload` stays off until Sustain Cloud (CLD-09).

### Consequences

* Good, because a repository adds two lines to a workflow and gets the check.
* Bad, because the committed bundle must be rebuilt with every change to the model it uses. CI catches a stale one.
