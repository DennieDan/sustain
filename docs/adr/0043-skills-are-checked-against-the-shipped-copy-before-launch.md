---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Skills are checked against the shipped copy before launch

## Context and Problem Statement

Generate and Start Learning checked only that `SKILL.md` existed. A repository could ship its own `.agents/skills/sustain-*/` or a same-named copy in another agent's folder, and Sustain would launch the agent on it with Sustain's pre-approvals. Claude Code applies a project skill's `allowed-tools` whether or not the folder is trusted (spec v0.3 SAF-01).

## Considered Options

* Hash every shipped skill file at build time and compare the installed copies before each launch
* Reinstall the skill before every launch

## Decision Outcome

Chosen option: "Hash every shipped skill file at build time and compare the installed copies before each launch", because it catches tampering without overwriting a user's deliberate local edits unasked.

The build writes `dist/skill-hashes.json`. A changed, missing or extra file in the folder the agent loads offers Reinstall. Another same-named copy that differs warns for Claude Code, which loads its own folder, and blocks Codex and Devin until it is removed. Links inside a skill are recorded and never followed.

### Consequences

* Good, because a repository cannot swap the skill Sustain launches.
* Bad, because any local edit to an installed skill now prompts before each launch.
