---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# External coding agent generates diagrams through a skill

## Context and Problem Statement

The prototype (`reference/sustain-prototype`, "ArchAlign") ran its own LLM agent loop: provider client, API key resolution, consent, tool sandbox, budgets and a repair loop. Sustain lives inside VS Code, where developers already run coding agents with their own credentials, permissions and sandboxes. Who produces the diagram?

## Decision Drivers

* No API keys, provider settings, budgets or consent flows inside the extension (spec §3).
* The extension must make no network requests (NFR-SEC-02).
* Diagram quality depends on deep code exploration, which coding agents already do well.

## Considered Options

* An external coding agent (Claude Code or Codex) driven by a skill shipped with the extension
* A built-in agent loop calling an LLM API, as in the prototype
* Static analysis only (import graph)

## Decision Outcome

Chosen option: "An external coding agent driven by a skill shipped with the extension", because it removes every LLM concern from the extension while keeping semantic, cited diagrams.

The extension never calls an LLM. It installs the skill (ADR 0006), can launch the agent in a terminal (FR-GEN-01), and views the result.

### Consequences

* Good, because the extension has no credentials, no network code and no agent loop to maintain.
* Good, because users keep their agent's own permission model and billing.
* Bad, because diagram generation requires an installed, authenticated agent CLI.
* Bad, because the extension cannot observe or cancel a run; it only sees the published candidate (FR-WAT-01).

### Confirmation

NFR-SEC-02's unit test (`test/unit/noNetwork.test.ts`) forbids network code in `src/**`; FR-LIVE-01/02 exercise the whole flow with real agents.

## Pros and Cons of the Options

### External coding agent with a skill

* Good, because the agent's file tools, sandbox and approvals are reused.
* Bad, because behaviour depends on how faithfully the agent follows the skill.

### Built-in agent loop

* Good, because the extension controls tools, budgets and the repair loop.
* Bad, because it needs API keys, consent for data egress and a large amount of agent code (prototype ADRs 0020–0028).

### Static analysis only

* Good, because it is deterministic and offline.
* Bad, because it yields a dependency graph, not an architecture with boundaries and labels.
