---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# The cloud accepts maps, never code

## Context and Problem Statement

Sustain Cloud stores architecture maps and pull request checks so teams can share them. Its promise is "maps, not code": a repository's source must never reach it, even by accident. Spec v0.3 CLD-02 defines the upload API that keeps that promise and decides who may upload.

## Considered Options

* One upload endpoint with a closed schema, a secret scan and two ways to authenticate
* Accepting any JSON and filtering on the server

## Decision Outcome

Chosen option: "One upload endpoint with a closed schema, a secret scan and two ways to authenticate", because a closed schema states exactly what the cloud holds and refuses everything else.

* `POST /api/v1/uploads` takes `{repo, commit, branch, kind: "map" | "check", map?, sidecars?: {run?, fingerprints?, evidence?}, check?, meta}`. `src/model/schemas/upload.schema.json` describes every object, and none allows extra properties. The map must also pass the vendored Archify schemas.
* SAF-03's secret scan runs over the whole body. A body over 1 MiB is refused before it is parsed.
* `src/model/upload.ts` holds the check, so `sustain.mjs publish` runs the same one before it sends.
* An upload is signed either with a GitHub Actions OIDC token, verified against GitHub's keys for issuer `https://token.actions.githubusercontent.com`, audience `sustain-cloud` and a `repository` claim equal to `repo`, or with a per-repository upload token. Tokens are shown once and stored only as their SHA-256.
* A repository may upload 60 times an hour.

### Consequences

* Good, because what the cloud stores is published as a schema anyone can read.
* Bad, because every new sidecar field needs a schema change before it can be uploaded.
