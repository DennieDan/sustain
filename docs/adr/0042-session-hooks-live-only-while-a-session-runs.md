---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# Session hooks live only while a session runs

## Context and Problem Statement

[ADR 0036](0036-session-install-skills-and-managed-hooks.md) had Install Agent Skills merge the learning-session hooks into `.devin/hooks.v1.json` and append `.sustain/` to `.gitignore`. Users who only wanted diagrams then carried a repository-local hook that ran on every Devin session start and prompt, and a `.gitignore` change in their commits. Spec v0.3 SAF-06 asks for hooks that exist only while a session runs.

## Considered Options

* Merge hooks at session launch, remove them when the lock goes, and keep Sustain's ignore lines in `.git/info/exclude`
* Keep merging at install and make the hook a no-op outside sessions

## Decision Outcome

Chosen option: "Merge hooks at session launch, remove them when the lock goes, and keep Sustain's ignore lines in `.git/info/exclude`", because nothing of the learning session then runs outside a session, and nothing Sustain writes reaches a commit.

Start Learning merges the hooks and the excludes. The `SessionWatcher` removes Sustain's hook entries when `.sustain/active` disappears, and activation removes them when no session is active. Generate adds the excludes for drafts and diagram pages.

### Consequences

* Good, because install touches only the skill folders.
* Good, because a repository that never runs a session never runs the hook.
* Bad, because a session that ends while VS Code is closed keeps its hooks until the next activation.
