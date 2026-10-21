---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# A core CLI shares the model with every host

## Context and Problem Statement

Pull request checks run in CI, where there is no editor. The IntelliJ plugin and the cloud upload need the same staleness, change and page logic as the extension. Spec v0.3 RCH-03 asks for one command-line entry that each of them can call.

## Considered Options

* One bundled script, `dist/cli/sustain.mjs`, over the same model modules the extension uses
* A separate package with its own copy of the logic

## Decision Outcome

Chosen option: "One bundled script, `dist/cli/sustain.mjs`, over the same model modules the extension uses", because one implementation keeps every host's answers the same.

* The commands are `install`, `verify-skills`, `staleness`, `changes`, `export-page`, `preflight` and `check`; `publish` joins with CLD-09.
* Each prints one JSON object, or markdown with `--format markdown`, and exits like the validator ([ADR 0017](0017-validator-output-contract-and-exit-codes.md)): 0 done or passed, 1 a finding that fails, 2 a usage or I/O error.
* The script finds the shipped skills, their hashes and the page assets beside itself, so a build of `dist/` is all it needs. Writes go through the confinement check (SAF-05).
* `--root` names the repository; the working directory otherwise.

### Consequences

* Good, because CI, the Action, the IntelliJ plugin and the extension agree by construction.
* Bad, because the script carries the page bundle, about 1.5 MB, so `export-page` works offline.
