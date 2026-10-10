---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Install the skill into .agents/skills with a .claude symlink

## Context and Problem Statement

Claude Code reads `.claude/skills/`, Codex reads `.agents/skills/` (ADR 0003). The skill's scripts are referenced by a repo-root path in `SKILL.md` and in the Claude pre-approval (ADR 0005). Where do the real files live, and how does the second agent see them?

## Considered Options

* Real files in `.agents/skills/sustain-architecture/`; `.claude/skills/sustain-architecture` is a relative symlink to it, copied when the symlink cannot be created
* Two independent copies
* Real files in `.claude/skills/`, symlink from `.agents/skills/`

## Decision Outcome

Chosen option: "Real files in `.agents/skills/sustain-architecture/`; `.claude/skills/sustain-architecture` is a relative symlink to it, copied when the symlink cannot be created", because there is one copy to update and both agents run the scripts by the same `.agents/...` path.

The symlink target is `../../.agents/skills/sustain-architecture` (`'junction'` type on Windows). The extension does not edit `.gitignore` (spec §3).

### Consequences

* Good, because a reinstall updates both agents at once.
* Good, because the relative link survives moving or cloning the repository.
* Bad, because the copy fallback can drift until the next reinstall.

### Confirmation

FR-INS-01 e2e tests assert that `.claude/skills/sustain-architecture` is a symbolic link after a fresh install.

## Pros and Cons of the Options

### Real files in `.agents`, symlink from `.claude`

* Good, because the script path in `SKILL.md` is the real location.
* Bad, because symlinks can fail on some file systems (covered by the copy fallback).

### Two copies

* Good, because no symlink support is needed.
* Bad, because the copies can diverge.

### Real files in `.claude`, symlink from `.agents`

* Good, because Claude Code sees real files.
* Bad, because the documented script path would then go through a symlink for Codex and the Claude pre-approval path would differ from the real location.
