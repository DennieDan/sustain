---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Target Claude Code and Codex

## Context and Problem Statement

Skills are an agent-specific packaging format. Each agent discovers skills in its own directory. Which agents does Sustain support, and therefore which skill directories does it write?

## Considered Options

* Claude Code (`.claude/skills/`) and Codex (`.agents/skills/`)
* Claude Code only
* Any agent that reads skill directories, with a configurable directory list

## Decision Outcome

Chosen option: "Claude Code (`.claude/skills/`) and Codex (`.agents/skills/`)", because both read the same `SKILL.md` format, which lets one skill serve both, and together they cover the owner's users.

Other agents and other skill directories are non-goals (spec §3).

### Consequences

* Good, because one skill source serves both agents (ADR 0004, ADR 0006).
* Good, because Generate Architecture only needs two launch recipes (FR-GEN-01).
* Bad, because frontmatter keys differ between agents; Codex must tolerate the Claude-only `disable-model-invocation` key (risk checked in FR-LIVE-02).

### Confirmation

FR-INS-01 e2e tests assert both directories; FR-LIVE-01 and FR-LIVE-02 run each agent.

## Pros and Cons of the Options

### Claude Code and Codex

* Good, because it covers the two agents the owner uses.
* Bad, because two install targets must be kept in sync.

### Claude Code only

* Good, because a single target is simpler.
* Bad, because Codex users are excluded.

### Configurable directory list

* Good, because it could reach more agents.
* Bad, because untested agents would get a skill whose frontmatter and invocation syntax may not work for them.
