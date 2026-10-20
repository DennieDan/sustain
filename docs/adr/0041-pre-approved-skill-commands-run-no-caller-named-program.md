---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Pre-approved skill commands run no caller-named program

## Context and Problem Statement

Claude Code applies a skill's `allowed-tools` without a prompt, and a `*` in a Bash rule matches any arguments. The bug-hunt skill pre-approved `Bash(node .agents/skills/sustain-bugfix/scripts/*)` together with `Edit` and `Write` on any path. `session.mjs verify --check-cmd "<anything>"` therefore ran a shell command without a prompt, and an edit could rewrite a pre-approved script before running it. This amends [ADR 0005](0005-manual-invocation-and-claude-pre-approvals.md) and the `--check-cmd` part of [ADR 0037](0037-session-command-contract-and-scoring.md) (spec v0.3 SAF-02).

## Considered Options

* Drop `--check-cmd`, narrow the Bash rules to data-only scripts, and pre-approve no edit tool
* Keep `--check-cmd` and pre-approve only the other subcommands

## Decision Outcome

Chosen option: "Drop `--check-cmd`, narrow the Bash rules to data-only scripts, and pre-approve no edit tool", because no pre-approved command can then start a program or change a file another rule executes.

The agent runs the project's check as an ordinary command, which prompts, and passes the result with `verify --check-exit <code>`. The ledger marks it `reportedBy: "agent"`. The bug-hunt agent's code edits prompt like any other edit.

### Consequences

* Good, because the skills add no capability beyond reading and their own data-only scripts.
* Good, because `test/unit/skill/preapprovals.test.ts` and `test/unit/execScan.test.ts` keep it that way.
* Bad, because a check result is now reported by the agent rather than observed by the referee.
* Bad, because the bug-hunt session asks permission for each edit the agent makes.
