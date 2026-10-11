---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Launch the agent terminal with shellPath and shellArgs

## Context and Problem Statement

`Sustain: Generate Architecture` starts Claude Code or Codex in an integrated terminal with the skill prompt (`/sustain-architecture <focus>` or `$sustain-architecture <focus>`). The focus is free text typed by the user and the Codex prompt starts with `$`. How is the CLI started so the prompt reaches it unchanged on every shell?

## Decision Drivers

* No shell quoting or expansion of user text (`$`, quotes, `;`, backticks).
* Works with whatever login shell the user has (bash, zsh, fish, PowerShell, cmd).
* The terminal stays an ordinary, interactive agent session.

## Considered Options

* Resolve the CLI on the extension host's `PATH` (plus `PATHEXT` on Windows) and create the terminal with `shellPath: <binary>`, `shellArgs: [prompt]`
* Create a default shell terminal and `sendText` a quoted command line
* Spawn the CLI with `child_process` inside a Pseudoterminal

## Decision Outcome

Chosen option: "Resolve the CLI on the extension host's `PATH` and create the terminal with `shellPath`/`shellArgs`", because the prompt is passed as one argv element, so no shell ever parses it, and VS Code still provides a real PTY for the agent's interactive UI.

Lookup (`src/extension/agents.ts` › `findOnPath`): each `PATH` entry in order, the first regular file that is executable (POSIX `X_OK`), trying `""` and each `PATHEXT` extension on Windows. Not found → warning "`<cli>` was not found on PATH." with "Copy prompt" (FR-GEN-01 step 7).

### Consequences

* Good, because focus text such as `auth "v2"; rm -rf` or `$HOME` reaches the agent verbatim.
* Good, because the terminal closes when the agent exits, like any terminal whose shell process ends.
* Bad, because the CLI must be on the extension host's `PATH`, which can differ from an interactive shell's (spec §12; "Copy prompt" covers it).
* Bad, because there is no shell around the agent, so shell aliases or functions named `claude`/`codex` are not used.

### Confirmation

`test/e2e/suite/single.generate.test.ts` asserts the created terminal's `creationOptions` (`shellPath` = stub CLI on a temp `PATH`, `cwd` = repo root, `shellArgs` = `[prompt]`) for both agents, and the missing-CLI warning with "Copy prompt"; `test/unit/extension/agents.test.ts` covers prompt formats and the lookup rules.

## Pros and Cons of the Options

### `shellPath` + `shellArgs`

* Good, because the argument vector is passed without a shell.
* Bad, because the lookup re-implements a small part of the shell's command resolution.

### `sendText` into a shell

* Good, because aliases and the user's shell `PATH` apply.
* Bad, because quoting differs per shell, and `$sustain-architecture` would be expanded by POSIX shells unless quoted correctly.

### Pseudoterminal with `child_process`

* Good, because the extension controls the process.
* Bad, because a pipe-backed pseudoterminal is not a TTY, which interactive agent UIs need.
