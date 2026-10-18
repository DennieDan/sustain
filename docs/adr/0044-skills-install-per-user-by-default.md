---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Skills install per user by default

## Context and Problem Statement

[ADR 0006](0006-install-skill-into-agents-with-claude-symlink.md) installed the skills into the repository's `.agents/skills/`, with a `.claude/skills` link. Every repository then carried Sustain's files, and the skill text named repository-root script paths. Claude Code gives a personal skill precedence over a project skill of the same name, and Codex and Devin read `~/.agents/skills/` (spec v0.3 SET-01).

## Considered Options

* Install into the user's home by default, with `sustain.skillScope: "project"` for the old layout
* Keep installing into the repository

## Decision Outcome

Chosen option: "Install into the user's home by default, with `sustain.skillScope: "project"` for the old layout", because nothing is added to the repository and a repository's own copy cannot shadow Sustain's for Claude Code.

The layout inside the base folder is unchanged: real files in `.agents/skills/<name>/` and a relative `.claude/skills/<name>` link. Skill bodies and `allowed-tools` use `${CLAUDE_SKILL_DIR}`, which Claude Code fills in; Codex and Devin are told to use the folder the SKILL.md was loaded from. A per-user install's session hook runs by absolute path.

### Consequences

* Good, because installing Sustain no longer changes the repository.
* Good, because the skill works from any location an agent reads.
* Bad, because a per-user install serves every repository at once, so one tampered copy affects all of them until the integrity check repairs it.
