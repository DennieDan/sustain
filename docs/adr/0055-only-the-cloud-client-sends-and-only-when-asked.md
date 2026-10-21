---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Only the cloud client sends, and only when asked

## Context and Problem Statement

The extension, the skill scripts and the core CLI make no network requests (NFR-SEC-02). Spec v0.3 CLD-09 adds two senders: `sustain.mjs publish` and the GitHub Action's `upload`. How do they send without weakening the rule for everything else?

## Considered Options

* One module, `src/cloud/client.ts`, that the no-network test allows by name
* Letting the CLI and the Action call `fetch` where they need it

## Decision Outcome

Chosen option: "One module, `src/cloud/client.ts`, that the no-network test allows by name", because a single named exception keeps every other file under the rule and makes any new sender a visible change to that test.

* `postUpload` sends one upload to `<cloud>/api/v1/uploads`; `actionsOidcToken` asks the running Actions job for a token with audience `sustain-cloud`.
* `sustain.mjs publish [--run] [--dry-run] [--url]` builds the upload from the map and its sidecars, runs the same `checkUpload` as the cloud (schema and secret scan) and sends nothing when it fails. `--dry-run` prints exactly what would be sent. The token comes from `SUSTAIN_TOKEN`, the address from `--url` or `SUSTAIN_CLOUD_URL`.
* The Action uploads only with `upload: true`: the check and the map it compared with, signed by the job's OIDC token, which needs `permissions: id-token: write`. The comment then links the pull request page. A failed upload is logged and leaves the job result to the check.
* The extension never imports the client.

### Consequences

* Good, because nothing leaves a machine or a runner unless the user ran `publish` or set `upload`.
* Bad, because the cloud's address is configuration until the owner chooses a domain.
