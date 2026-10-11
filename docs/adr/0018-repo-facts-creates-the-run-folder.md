---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# repo-facts.mjs creates the run folder

## Context and Problem Statement

Each skill run writes `draft.json` into a fresh `.archify/architecture-<slug>-<YYYYMMDD-HHMMSS>[-N]/` folder. The name depends on the focus text, the repo folder name, local time and existing folders. Who computes the name and creates the folder?

## Decision Drivers

* Agents should write exactly one file (FR-SKL-02 step 5) and never invent paths.
* The name must follow the prototype's `slugify` and collision rules so the viewer can sort runs (FR-VIEW-02).
* Two runs started in the same second must not share a folder.

## Considered Options

* `repo-facts.mjs` computes the name, creates the folder (with `-2`, `-3`, … on collision) and prints `runFolder` and `draft`
* `repo-facts.mjs` only prints a suggested name; the agent creates the folder when writing the draft
* `validate.mjs` creates the run folder from a draft written elsewhere

## Decision Outcome

Chosen option: "`repo-facts.mjs` computes the name, creates the folder and prints `runFolder` and `draft`", because creating the folder with `mkdir` (which fails on an existing name) reserves it atomically, and the agent only has to write to the printed `draft` path.

Output: `{root, runFolder, draft, git}`; `root` is the absolute cwd; `runFolder`/`draft` are repo-relative with `/`. `git` is `null` when FR-GIT-01 yields no facts, otherwise `{head, origin, dirtyCount, dirty}` with `origin: null` when there is no origin. `.archify/` is created if missing and must resolve to a folder inside the repo root. Arguments other than none or `--focus <text>`, or a failure to create the folder, exit 2 with a message on stderr and nothing on stdout.

### Consequences

* Good, because the agent never computes timestamps or slugs.
* Good, because concurrent runs get distinct folders.
* Bad, because an abandoned run leaves an empty folder in `.archify/` (it has no `candidate.json`, so the viewer ignores it).

### Confirmation

`test/unit/agent/repoFacts.test.ts` (built script: shape, slug from focus and folder name, forced collision → `-2`, git facts, git absent, usage errors, unusable `.archify`) and `test/unit/model/runFolder.test.ts` (ported slug table and run-folder tests).

## Pros and Cons of the Options

### `repo-facts.mjs` creates the folder

* Good, because the folder is reserved before the agent starts exploring.
* Bad, because the script has a side effect beyond printing facts.

### Agent creates the folder

* Good, because `repo-facts.mjs` stays read-only.
* Bad, because two runs could pick the same name, and an extra write needs approval in Claude Code.

### Validator creates the folder

* Good, because folders only appear for validated output.
* Bad, because the draft would need a temporary location the agent must invent.
