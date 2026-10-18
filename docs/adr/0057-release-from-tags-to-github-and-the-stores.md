---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Release from tags to GitHub and the stores

## Context and Problem Statement

ADR-0014 limited Sustain to desktop VS Code installed from a `.vsix`. ADR-0028 packaged it without a licence or repository metadata. Spec v0.3 RCH-05 asks for store-ready packages, a release pipeline on tags and the cloud deployed from `main`. The licence is still the owner's decision.

## Considered Options

* A tag workflow that builds everything and publishes each store step only when its secret exists
* Manual packaging and uploads by the owner

## Decision Outcome

Chosen option: "A tag workflow that builds everything and publishes each store step only when its secret exists", because one tag then releases the same checked files everywhere, and a missing secret or licence skips a step without failing the release.

* The package carries a PNG icon, `repository`, `homepage`, `bugs`, `keywords`, `categories` and `preview: true`. `npm run package` runs `scripts/package.mjs`, which passes `--skip-license` only while the repository has no `LICENSE` file.
* `.github/workflows/release.yml` runs on `v*` tags. It runs the gates and builds the `.vsix`, the skill zip, the Action bundle, the CLI and `SHA256SUMS`. It fails when the committed Action bundle or skill scripts differ from a fresh build.
* A tag with a hyphen is a dry run. Its files are kept as a workflow artifact, and nothing is released.
* Other tags create a GitHub release. Open VSX publishes when `OVSX_PAT` exists and `package.json` declares a licence. The Marketplace publishes with `vsce publish --azure-credential` when the Entra ID secrets exist.
* `.github/workflows/deploy-cloud.yml` deploys `cloud/` from `main` through the owner's deploy hook, once the repository variable `SUSTAIN_DEPLOY` is `true`. The server opens its database in Next's start hook, so migrations run before it serves requests.
* The extension remains desktop-only, and each command works in one chosen folder (FR-WS-01), as ADR-0014 decided.

### Consequences

* Good, because a release needs only a tag, and a hyphenated tag rehearses it.
* Good, because the stores are reached as soon as the owner adds the secrets and a licence.
* Bad, because Open VSX stays closed until a licence is declared.

### Confirmation

`test/unit/package.test.ts` checks the metadata, the packaging arguments and both workflows. `npm run package` on 2026-10-18 produced `sustain-0.2.0.vsix` with the icon, the repository links and the preview flag. The dry run on a pre-release tag is `[ci]`, and the first publish and deploy are `[smoke]` (progress, Waiting).
