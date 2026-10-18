---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Skills ship with their built scripts

## Context and Problem Statement

The skills' scripts were built into `dist/` only, so a skill copied straight from the repository had no scripts to run. Spec v0.3 RCH-02 lets people add the skills without the extension, with `npx skills add owner/repo` or as a Claude Code plugin, both of which copy the committed folders as they are.

## Considered Options

* Commit the built scripts in each skill folder, refreshed by the build and checked in CI
* Build the scripts at install time

## Decision Outcome

Chosen option: "Commit the built scripts in each skill folder, refreshed by the build and checked in CI", because copying a folder is all either installer does, and the scripts are dependency-free bundles.

* `npm run build` copies each skill's built `scripts/` back into `skills/<name>/scripts/`, and the architecture skill's `references/` into the refresh skill. A unit test and the `skills-fresh` CI job fail when the committed copies differ from a fresh build.
* `npm run build:release` assembles `release/plugin/` with the map skills, `.claude-plugin/plugin.json` and a marketplace manifest; CI validates it with `claude plugin validate`.
* The extension still installs from `dist/skills/`, which the same build fills, so every route installs the same files and the integrity hashes (SAF-01) cover them all.

### Consequences

* Good, because the skills work from a plain copy of the repository.
* Bad, because about 3.7 MB of generated scripts are committed, most of it the diagram page bundle that `render-html.mjs` carries.
