---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Sessions enforce the hunt in each agent's own hooks

## Context and Problem Statement

ADR-0032 enforces the hunt phase through Devin's hooks and leaves Claude Code and Codex to the skill's rules. Spec v0.3 LRN-01 runs bug hunts in Claude Code and Codex too, with their hooks following ADR-0042's lifecycle. Codex now has hooks, and the Devin CLI also reads `.claude/` hooks. How is the hunt enforced in each agent without blocking an edit twice?

## Considered Options

* Merge only the launching agent's hooks, and remove Sustain's entries from the other agents' files
* Merge all three files at every launch
* Make the hook script detect which agent runs it

## Decision Outcome

Chosen option: "Merge only the launching agent's hooks, and remove Sustain's entries from the other agents' files", because each agent then meets exactly one Sustain entry, whichever files it reads.

* Claude Code gets a PreToolUse group in the `hooks` of `.claude/settings.local.json`, matching `Edit|Write|NotebookEdit|Agent`. Codex gets one in `.codex/hooks.json`, matching `apply_patch`. Devin keeps its block in `.devin/hooks.v1.json` (ADR-0040).
* Claude Code and Codex run the hook script by absolute path. The script finds the repository through `DEVIN_PROJECT_DIR` or `CLAUDE_PROJECT_DIR`, and otherwise as the nearest folder above the event's `cwd` that holds `.sustain/active`. While the session hunts, it exits 2 with the reason on stderr for those tools.
* Every other key and hook in those files stays as the user left it. A hook object is Sustain's when its command contains `.agents/skills/sustain-` (ADR-0040).
* When the lock goes, and at activation without a session, Sustain's entries leave all three files. A file holding nothing else is deleted.
* Codex runs a project hook only after the user trusts it with `/hooks`. The launcher says so. The command stays the same from session to session, so one approval lasts.

### Consequences

* Good, because "the user fixed it themselves" holds in all three agents, not only in Devin.
* Bad, because a Codex session is unenforced until the user trusts the hook once.

### Confirmation

`test/unit/extension/hooksFiles.test.ts` › LRN-01 checks the merges, the one entry per agent and the removal. `test/unit/agent/session-hook.test.ts` › LRN-01 checks the verdicts on Claude Code's and Codex's tools. `test/e2e/suite/single.session.test.ts` › LRN-01 launches a stub Claude Code. A real session per agent is `[smoke]` (progress, Waiting).
