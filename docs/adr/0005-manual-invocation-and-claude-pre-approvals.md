---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# Manual skill invocation and Claude tool pre-approvals

## Context and Problem Statement

Agents may invoke skills on their own when a request looks relevant. A diagram run reads much of the repository and writes into `.archify/`, so it should only happen when the user asks for it. Which tools may the skill use without prompting?

## Considered Options

* Manual invocation only, with read/search tools and the two bundled scripts pre-approved in Claude Code
* Implicit invocation allowed
* Manual invocation, no pre-approvals

## Decision Outcome

Chosen option: "Manual invocation only, with read/search tools and the two bundled scripts pre-approved in Claude Code", because runs stay deliberate while the long exploration phase does not stall on approval prompts.

* Claude Code: `disable-model-invocation: true` and `allowed-tools: Read Grep Glob Bash(node .agents/skills/sustain-architecture/scripts/*)`.
* Codex: `agents/openai.yaml` sets `policy.allow_implicit_invocation: false`.
* Writes (the draft) still prompt in Claude Code.

### Consequences

* Good, because the agent never starts a run uninvited.
* Good, because reads, searches and script runs need no approval; the single write does.
* Bad, because Codex sees a Claude-only frontmatter key; tolerance is verified in FR-LIVE-02, and a fallback needs owner approval (spec §12).

### Confirmation

FR-SKL-01 unit test asserts the frontmatter and `openai.yaml` fields; FR-LIVE-02 checks Codex does not invoke the skill implicitly.

## Pros and Cons of the Options

### Manual invocation with pre-approvals

* Good, because it balances control and flow.
* Bad, because the `Bash(...)` pattern ties the skill to its install path.

### Implicit invocation

* Good, because agents could offer diagrams proactively.
* Bad, because an unrelated question could trigger a long, file-writing run.

### No pre-approvals

* Good, because every action is confirmed.
* Bad, because dozens of read prompts make the run impractical.
