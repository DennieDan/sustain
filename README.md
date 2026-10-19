# Sustain

Sustain shows a repository's architecture as a diagram inside VS Code and opens the code behind each box. The diagram is written by a coding agent you already use, Claude Code or Codex, following a skill that ships with the extension. Sustain itself never calls an AI service and makes no network requests.

Diagrams use the [Archify](https://github.com/tt-a1i/archify) JSON format (architecture diagrams, `schema_version: 1`). Sustain is not affiliated with Archify.

## Requirements

- Desktop VS Code 1.126 or newer, or a fork based on it such as Cursor or Devin Desktop (not VS Code for the Web or remote-only workspaces).
- Node.js 18 or newer on your `PATH`: the agent runs the skill's two scripts with `node`.
- To generate diagrams: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`) or [Codex](https://github.com/openai/codex) (`codex`) installed and signed in. Viewing existing diagrams needs neither.

## Install

Sustain is distributed as a `.vsix` file, not through the Marketplace.

1. In VS Code, open the Extensions view, click `…` (Views and More Actions) and choose **Install from VSIX…**.
2. Pick `sustain-<version>.vsix`.

Or from a terminal: `code --install-extension sustain-<version>.vsix`.

To build the `.vsix` from source: `npm ci && npm run package`.

## Commands

Run them from the Command Palette (⇧⌘P / Ctrl+Shift+P). In a multi-root workspace each command first asks which folder to use.

| Command | What it does |
|---|---|
| **Sustain: Install Agent Skills** | Copies the `sustain-architecture` skill into `.agents/skills/sustain-architecture/` and links `.claude/skills/sustain-architecture` to it (a copy if links are not possible). Asks before overwriting an existing install. |
| **Sustain: Generate Architecture** | Asks for an optional focus, then (when the folder already has a diagram) whether to update the latest diagram or regenerate from scratch, then an agent, and starts Claude Code or Codex in a terminal with the skill invocation. Offers to install the skill first if it is missing. If the agent is not on `PATH`, it offers to copy the prompt instead. |
| **Sustain: Open Architecture** | Opens the newest diagram of the folder in the architecture panel. |
| **Sustain: Open Architecture File…** | Lists every diagram of the folder, newest first, plus **Browse…** to open any Archify JSON file. |

## Generating a diagram

The skill is invoked manually; agents never start it on their own.

1. Run **Sustain: Install Agent Skills** once per repository. Commit the skill folders or add them to your `.gitignore`, as you prefer; Sustain does not edit `.gitignore`.
2. Run **Sustain: Generate Architecture**, or start the skill yourself in your agent:
   - **Claude Code:** `/sustain-architecture` followed by an optional focus, e.g. `/sustain-architecture payment flow`. Reading, searching and the skill's scripts are pre-approved; Claude Code still asks before writing the diagram file.
   - **Codex:** `$sustain-architecture` followed by an optional focus, e.g. `$sustain-architecture payment flow`.
3. The agent creates a run folder and decides, with the skill's `change-map.mjs`, whether to update the previous diagram or draw a new one (see below). It writes `draft.json` and runs the validator, fixing what the validator reports (at most three repairs). When the diagram is accepted, the validator saves it as `candidate.json`.
4. Sustain notices the new diagram: the open panel switches to it, or a notification offers to open it.

An empty focus produces a whole-system overview; a focus such as "auth" or "deployment" narrows the diagram.

### Updating instead of regenerating

When an accepted diagram with the same focus already exists, the skill updates it instead of drawing a new one. A script compares the commit the previous diagram was drawn at with your working tree (committed, staged and unstaged edits and untracked files) and groups the changed code by the diagram components whose cited files it touches. The agent re-reads only those components and the changed files no component cites, and patches the previous diagram. Everything else keeps its ID, text and citations, so hand edits survive and two diagrams of an unchanged repository are identical.

The skill regenerates from scratch instead, and then gives matching components and connections their previous IDs back, when:

- you choose **Regenerate from scratch** in **Sustain: Generate Architecture**, or start the skill with `--regenerate` before the focus (`/sustain-architecture --regenerate payment flow`, `$sustain-architecture --regenerate`);
- the previous diagram was updated 5 times in a row, so drift cannot pile up;
- there is no previous diagram for this focus, no git repository, or the previous commit is unknown or no longer part of the current history (after a rebase or force-push);
- the previous run started from a working tree with more than 200 uncommitted paths, or the change description would exceed 2 MiB.

Updates miss changes that touch no cited file, such as moving code into new packages; the periodic regeneration catches those.

## Using the viewer

- Click a box to open the code it cites in the other editor column, with the cited lines selected and briefly highlighted.
- Hover a box to see its description and all of its source references; click a reference to open it.
- Drag empty space or scroll to pan. Zoom with Ctrl/⌘ + scroll, a pinch, the toolbar (Fit, −, +, 100 %) or the keys `+`, `-`, `0` (100 %) and `f` (fit).
- References are checked when you click them. A file that no longer exists, or lines beyond the end of a file, are reported as stale references. Line moves within a file are not detected.
- The panel follows changes: editing or regenerating the shown diagram reloads it.

### Seeing what changed

When a diagram was made by updating an earlier one, the viewer compares the two. The header above the diagram says what it is compared with: the earlier diagram's commit (short hash, message, how long ago) and how many files were uncommitted at that time, then the commit of the diagram you are looking at, and the number of added, removed and changed elements.

- On the diagram, new boxes, connections and boundaries are marked `NEW` and drawn in your theme's "added" colour; changed ones are marked `CHANGED` (`RENAMED` for a relabelled boundary) in the "modified" colour. Removed elements are not drawn.
- The **Changes** panel on the right lists every addition, removal and change, with what changed (for example a new label). Click an entry to zoom to it. **Open baseline** opens the earlier diagram.
- After an update, the panel also lists **Code changed, kept**: boxes whose cited code changed but which the agent left as they were (marked `KEPT` on the diagram), and **Not in any component**: changed files that no box cites. Click a file to open it.
- The **Changes** button hides or shows the marks and the panel; the choice is remembered for the panel.
- **Compare with…** lets you compare with any other diagram in `.archify/`, or with none. Sustain warns, without refusing, when a comparison is doubtful: a different focus, few shared components, a different repository, a diagram that is not in this one's update history, or a baseline that is newer than the open diagram (with a **Swap** button). When a regeneration lies between the two diagrams, the comparison is labelled "approximate", because regenerated elements may have new IDs and show up as removed plus added.

## What is in `.archify/`

Each generation is a run folder: `.archify/architecture-<slug>-<YYYYMMDD-HHMMSS>/` (with `-2`, `-3`, … if two runs start in the same second). It contains:

- `draft.json` while the agent is working, or after a run that ended without passing validation;
- `candidate.json` once the validator accepted the diagram. This is the file Sustain opens;
- `lineage.json`: whether the run updated or regenerated, why, which run it continued, and the commits involved (hash, message and date), and how many updates have happened since the last regeneration;
- `change.md` and `mapping.md` in update runs: the code change grouped by component, and the list of changed, unchanged and uncited parts the agent worked from;
- `changes.json` in update runs: the same change as data, which the viewer uses for "Code changed, kept" and "Not in any component".

Validation checks the Archify JSON Schema, that every connection has an ID, that IDs and references are consistent, and that every cited file exists inside the repository with the cited lines. It removes layout and presentation fields (Sustain computes the layout) and fills in `meta.repository` from git when the repository has an `origin` remote. Secrets are never cited: `.env` files, keys, credential files, `.git/` and `.archify/` are rejected.

Archify files from other tools open too; files with positions for every component are drawn as authored.

## License notices

`THIRD_PARTY_NOTICES.md`, shipped with the extension, lists the Archify material (MIT) included in Sustain.
