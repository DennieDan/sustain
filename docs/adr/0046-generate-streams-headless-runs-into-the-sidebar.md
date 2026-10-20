---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Generate streams headless runs into the sidebar

## Context and Problem Statement

[ADR 0020](0020-launch-agent-terminal-with-shellpath-and-shellargs.md) starts the agent in a terminal, where the user watches raw agent output and Sustain sees nothing until a candidate appears. Spec v0.3 UI-02 wants the run in the sidebar: what the agent reads and writes, tokens, cost, Cancel, and the map opening on acceptance. How does the extension run the agent without giving it more permission than a terminal run has?

## Decision Drivers

* No flag that skips the agent's permission checks (SAF-04).
* The user's focus text reaches the agent as one argument, as in ADR 0020.
* Cancel stops everything the agent started.

## Considered Options

* Spawn the agent's headless mode with the tools the run needs, and parse its JSON lines
* Keep the terminal and scrape its output
* Drive the agents through their SDKs

## Decision Outcome

Chosen option: "Spawn the agent's headless mode with the tools the run needs, and parse its JSON lines", because both CLIs document a machine-readable stream and a way to refuse tools without a prompt.

* Claude Code runs `claude -p <prompt> --output-format stream-json --verbose --permission-mode dontAsk --allowedTools Read Grep Glob <the skill's two script rules> Edit(./.archify/**)`. Anything else is refused and reported as a denial, which the card shows with "Run in terminal instead".
* Codex runs `codex exec --json --sandbox workspace-write <prompt>`.
* The binary comes from an absolute PATH entry (SAF-04) and is spawned without a shell. On POSIX it leads its own process group, so Cancel signals the group; Windows uses `taskkill /T`. Windows `.cmd` and `.bat` launchers need `cmd.exe`, which would parse the focus, so those agents run in a terminal.
* `sustain.runMode` picks the sidebar (the default) or the terminal of ADR 0020. Both modes follow `run.json` for the card; the sidebar run adds the agent, mode, tokens and cost to it, and opens the map once the run is accepted.

### Consequences

* Good, because the user sees progress, tokens and cost without leaving the editor, and a refused tool is visible instead of a silent stall.
* Good, because the permission boundary is the agent's own, narrowed further.
* Bad, because the parsers follow each CLI's output format and change when it changes. The fixtures were written from the docs and are replaced by recorded runs at the first `[smoke]` run.
