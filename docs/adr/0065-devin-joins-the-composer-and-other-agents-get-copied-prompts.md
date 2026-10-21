---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Devin joins the composer, and other agents get copied prompts

## Context and Problem Statement

ADR-0003 targets Claude Code and Codex and calls other agents non-goals. Learning sessions already run in Devin (ADR-0040, LRN-01), and spec v0.3 RCH-04 brings Devin into the composer in terminal mode, marks every skill `triggers: [user]`, and adds "Copy prompt for…" GitHub Copilot agent mode, Cursor's agent, Gemini CLI, OpenCode and Devin Desktop. Which agents does Sustain launch, and what does it give the rest?

## Considered Options

* Launch Claude Code, Codex and Devin, and copy a prompt for the other agents
* Launch every agent that has a CLI
* Keep Claude Code and Codex only

## Decision Outcome

Chosen option: "Launch Claude Code, Codex and Devin, and copy a prompt for the other agents", because Sustain can launch only agents with a CLI it can run safely, and the rest still read the same SKILL.md.

* The composer finds Devin on PATH or where it installs. Devin always runs in a terminal with `devin -- "/sustain-architecture <focus>"`, never streams into the sidebar, and reports no tokens, so it has no estimate. Ask and the explain-back stay with Claude Code and Codex.
* Every shipped SKILL.md carries `triggers: [user]` next to `disable-model-invocation: true`, so agents that read either key run the skills only when asked.
* "Copy prompt for…" copies `@sustain-architecture <focus>` for Devin Desktop, which mentions skills by name. For GitHub Copilot agent mode, Cursor's agent, Gemini CLI and OpenCode it copies a request to follow the installed skill's SKILL.md and run its scripts from that folder, which needs no agent-specific skill support. Missing skills are installed first.
* Skills still install into `.agents/skills/` with links in `.claude/skills/` (ADR-0044).

### Consequences

* Good, because users of other agents get a working prompt instead of nothing.
* Bad, because Sustain cannot see what a copied prompt costs or whether its run finished.

### Confirmation

`test/unit/extension/launchArgs.test.ts` › RCH-04 checks Devin's argv and every copied prompt, and `test/unit/skill/skill.test.ts` › RCH-04 the `triggers` key. One real Devin run is `[smoke]` (progress, Waiting).
