---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Command UI details not fixed by the spec

## Context and Problem Statement

FR-WS-01, FR-INS-01 and FR-GEN-01 fix the command names, prompts, buttons and messages, but leave some user-visible details open: the success text of the install notification, QuickPick placeholders, whether the "install first?" question is modal, what happens to whitespace in the focus, how dismissing a prompt behaves, and whether the backticks in messages such as "`<cli>` was not found on PATH." are literal.

## Decision Drivers

* Stay literal to every string the spec gives.
* Dismissing any prompt must never leave partial changes behind.

## Considered Options

* Literal spec strings (backticks included), minimal additions, dismiss = abort silently
* Rephrase messages in VS Code's usual style (quotes instead of backticks) and confirm cancellations with a notification

## Decision Outcome

Chosen option: "Literal spec strings (backticks included), minimal additions, dismiss = abort silently", because it changes nothing the spec states and adds only what a QuickPick or notification needs to be understandable.

* Messages are used exactly as written in §7, including the backticks around placeholders: "`claude` was not found on PATH.".
* Install success (FR-INS-01 "info notification naming both paths"): "Installed the sustain-architecture skill in .agents/skills/sustain-architecture and .claude/skills/sustain-architecture (symlink)." — `(copy)` when the symlink fallback was used.
* The overwrite question is modal ("a modal asks"); VS Code supplies its Cancel button. The "Install the sustain-architecture skill first?" question is a normal information message with "Install" and "Cancel" buttons, since the spec does not call it modal.
* QuickPick placeholders: "Workspace folder" (FR-WS-01) and "Agent" (FR-GEN-01); folder items show the folder name with its path as description.
* The focus is trimmed; whitespace only counts as empty.
* Escape on any prompt (folder, install, focus, agent, overwrite) ends the command without changes or further notifications. If the install offered by Generate is cancelled at the overwrite prompt, Generate stops.

### Consequences

* Good, because every spec string can be found verbatim in the code and tests.
* Bad, because literal backticks look unusual in VS Code notifications, which do not render Markdown.

### Confirmation

`test/e2e/suite/single.install.test.ts`, `single.generate.test.ts`, `empty.folders.test.ts` and `multi.folders.test.ts` assert the exact strings, buttons and the modal flag.

## More Information

If the owner reads the backticks as Markdown for "placeholder", replacing them is a one-line change per message plus its test; that change needs owner approval (spec §10).
