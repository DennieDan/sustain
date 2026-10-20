---
status: superseded by [ADR-0057](0057-release-from-tags-to-github-and-the-stores.md)
date: 2026-10-10
decision-makers: owner
---

# Desktop VS Code, .vsix install, one chosen folder

## Context and Problem Statement

The extension spawns agent CLIs in terminals, creates symlinks and reads the local file system. Which VS Code environments must it support, how is it distributed, and what is the repository root in multi-root workspaces?

## Considered Options

* Desktop VS Code only, installed from a `.vsix`; commands ask for one folder when several are open
* Desktop, web and remote workspaces; Marketplace publishing
* Desktop only, but treat every workspace folder at once

## Decision Outcome

Chosen option: "Desktop VS Code only, installed from a `.vsix`; commands ask for one folder when several are open", because the agent CLIs and scripts need a local file system and Node, and one root per command keeps citation resolution unambiguous.

Folder choice is FR-WS-01; packaging is FR-PKG-01.

### Consequences

* Good, because local `fs`, `child_process` and symlinks are always available.
* Good, because every citation resolves against exactly one repo root.
* Bad, because VS Code for the Web and remote-only workspaces are unsupported.
* Bad, because updates are manual `.vsix` installs.

### Confirmation

FR-WS-01 e2e tests; FR-PKG-01 `[manual]` clean-profile install.

## Pros and Cons of the Options

### Desktop, `.vsix`, one folder

* Good, because it is the smallest surface that serves the goals.
* Bad, because multi-root users pick a folder each time.

### Web, remote and Marketplace

* Good, because reach is wider.
* Bad, because terminals, `node` and the file system behave differently or are absent.

### All folders at once

* Good, because there is no picker.
* Bad, because diagrams and citations from different roots would mix.
