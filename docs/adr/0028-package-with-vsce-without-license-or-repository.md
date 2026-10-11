---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Package with vsce, without LICENSE or repository metadata

## Context and Problem Statement

FR-PKG-01 asks for `npm run package` producing `sustain-<version>.vsix` with `@vscode/vsce`. The repository has no `LICENSE` file and `package.json` no `repository` field; choosing a license and a public repository URL are owner decisions. `vsce package` refuses to continue without a license (interactive prompt) and rewrites relative README links only when it knows the repository. How do we package now?

## Considered Options

* `vsce package --no-dependencies --skip-license --allow-missing-repository`, with the build in `vscode:prepublish` and no relative links in `README.md`
* Add a LICENSE and a repository URL chosen by the implementer
* Leave packaging to the owner

## Decision Outcome

Chosen option: "`vsce package --no-dependencies --skip-license --allow-missing-repository`", because it produces the `.vsix` today without deciding licensing or hosting for the owner, and `.vscodeignore` already ships `LICENSE` once one exists.

* `--no-dependencies`: everything the extension needs is bundled into `dist/` (NFR-QUAL-02), so `node_modules` is never packaged.
* `vscode:prepublish` runs `node esbuild.mjs`, so a package always contains a fresh build.
* `README.md` names `THIRD_PARTY_NOTICES.md` without linking it, since vsce cannot rewrite relative links without a repository URL.

### Consequences

* Good, because `npm run package` is non-interactive and reproducible.
* Bad, because the `.vsix` carries no license file; the owner should add one (then drop `--skip-license`) before sharing it.

### Confirmation

`npm run package` on 2026-10-11 produced `sustain-0.1.0.vsix` (14 files: `dist/**`, `package.json`, `readme.md`, `THIRD_PARTY_NOTICES.md`); `code --install-extension` into a fresh `--extensions-dir`/`--user-data-dir` of VS Code 1.141.0 listed `sustain.sustain@0.1.0` (progress log, M5).
