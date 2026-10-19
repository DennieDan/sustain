# Features

What v0.3 built, by milestone, as of 2026-10-19 on `kerk` ([pull request #4](https://github.com/xplus2g4/sustain/pull/4)). [progress-v0.3.md](progress-v0.3.md) has each feature's tests and evidence, and [spec-v0.3.md](spec-v0.3.md) has the full requirements. [dogfood.md](dogfood.md) says how to try it.

- ✅ 69 built and tested.
- 🟡 13 built, and waiting on a CI result or a smoke run with a real agent. The Waiting section of progress lists the steps.
- ⛔ 2 not built: sharing from the extension (CLD-12), which needs your go, and the IntelliJ plugin's Kotlin half, which needs a JDK and Gradle.

## D1 Safe to ship

| ID | Feature | What it does | Status |
|---|---|---|---|
| ENG-01 | Toolchain and CI | Node 26 pinned; checks, e2e and packaging on every push | 🟡 CI fails on macOS and Windows |
| ENG-02 | Meaningful layout test | The performance test passes on slower machines and still catches regressions | ✅ |
| ENG-04 | Third-party notices | Licence notices for every bundled package | ✅ |
| SAF-01 | Skill integrity check | Sustain refuses to launch a skill a repository has tampered with or shadowed | ✅ |
| SAF-02 | Safe pre-approvals | No pre-approved agent command can run arbitrary programs or rewrite a script it later runs | ✅ |
| SAF-03 | Repository content is data | Prompt-injection rules in the skills; secrets never reach a map or an upload; map text never executes | ✅ |
| SAF-04 | Safe launch arguments | Agents launched by absolute path, never with permission-skipping flags | ✅ |
| SAF-05 | Write confinement | Sustain never writes outside the repository through a link | ✅ |
| SAF-06 | Hook lifecycle | Learning-session hooks exist only while a session runs; install doesn't edit `.gitignore` | ✅ |
| SAF-07 | Git and workspace hardening | Git can't run repository-controlled programs; Sustain stays off in untrusted workspaces | ✅ |

## D2 The product in VS Code

| ID | Feature | What it does | Status |
|---|---|---|---|
| UI-01 | Sustain sidebar | A Sustain icon in the Activity Bar opens a home panel: composer, runs, maps, setup, sessions | ✅ |
| UI-02 | Runs streamed into the sidebar | Generate runs the agent headless and shows its live activity, tokens and cost; terminal mode stays | 🟡 waits for a smoke run |
| UI-03 | Editor title buttons | "Show in Map" at the top right of every editor; map actions at the top right of the map | ✅ |
| UI-04 | Status bar item | Sustain's state (idle, generating, changed boxes); click opens the sidebar | ✅ |
| UI-05 | Explorer and box menus | Right-click a folder to map it, a file to find it on the map, a box for its actions | ✅ |
| UI-06 | Ask about the map | A sidebar chat: your agent answers using the map, with clickable `file:line` links | 🟡 waits for a smoke run |
| SET-01 | Install anywhere | Skills install per user by default (nothing added to the repository) and work from any location | 🟡 waits for a smoke run |
| SET-02 | Setup check | The sidebar shows what's missing (Node, agent CLI, skill, git) with a fix for each | ✅ |
| SET-03 | One-click Generate | From a fresh folder to a running agent in one click | ✅ |
| CST-04 | Run record | Every run records its kind, attempts, tokens and outcome | ✅ |

## D3 The living map

| ID | Feature | What it does | Status |
|---|---|---|---|
| VWR-01 | Host bridge | One viewer for VS Code, standalone pages, the cloud and IntelliJ | ✅ |
| FRS-01 | Fingerprints | Every accepted map stores hashes of the code it cites (the cache key) | ✅ |
| FRS-02 | Staleness | Each box is known to be fresh, moved, edited or missing, at zero tokens | ✅ |
| FRS-03 | Freshness on the map | Changed and missing boxes badged; moved code still opens at the right lines | ✅ |
| FRS-04 | Change overlay | See which boxes your changes touch, and which changes no box covers | ✅ |
| FRS-05 | Refresh skill | Update the map from what changed instead of starting over | ✅ |
| FRS-06 | Refresh from the UI | Refresh from the sidebar, the map, the status bar or a box | ✅ |
| ACC-01 | Behaviour over names | The skill cites behaviour, not just declarations; declaration-only boxes are flagged | ✅ |
| RCH-01 | Diagram page | A standalone HTML map that opens code in VS Code, Cursor, JetBrains or GitHub | 🟡 waits for a smoke run |

## D4 Pull request checks

| ID | Feature | What it does | Status |
|---|---|---|---|
| RCH-03 | Core CLI | One Node command for install, staleness, changes, export, PR checks and upload | ✅ |
| PRC-01 | Delta report | For any diff: touched boxes, stale boxes, uncovered code, new box candidates, gone boxes, at zero tokens | ✅ |
| PRC-02 | Review changes in the editor | A sidebar review of your branch, with ghost boxes for what the map is missing and one-click "Add to map" | ✅ |
| PRC-04 | GitHub Action | A pull request comment with the delta report and a Mermaid diagram, plus a pass/fail check: free, zero tokens | 🟡 CI needs a committed map |

## D5 Sustain Cloud v1

| ID | Feature | What it does | Status |
|---|---|---|---|
| CLD-01 | Accounts and organizations | Sign in with GitHub; access follows GitHub repository permissions | ✅ |
| CLD-02 | Upload API | Maps and check results uploaded from CI or the CLI, validated so no code can get in | ✅ |
| CLD-03 | Map pages | Every repository's map on the web, clickable into GitHub, with history | ✅ |
| CLD-04 | Pull request pages | The delta report of every pull request on the web | ✅ |
| CLD-08 | Public site | Landing page, docs, privacy, and a gallery of public maps | ✅ |
| CLD-09 | Upload from the CLI and the Action | `sustain publish` and the Action's `upload: true` | ✅ |
| CLD-11 | Delete data | Owners delete a map, a repository's data or their account | ✅ |

## D6 Ship

| ID | Feature | What it does | Status |
|---|---|---|---|
| RCH-02 | Skills from GitHub and as a plugin | `npx skills add` and a Claude Code plugin install working skills | 🟡 waits for a smoke run |
| RCH-05 | Packaging and release | Store-ready packages, a tagged release pipeline, and the cloud deployed | 🟡 waits for CI and a smoke run |
| DOC-01 | README | Quick starts per setup, cost, what Sustain touches, how to remove it | ✅ |

## I1 Cost

| ID | Feature | What it does | Status |
|---|---|---|---|
| CST-01 | Repository size | Size facts (files, lines per language, tier) for every run | ✅ |
| CST-02 | Token estimate | An estimated token range per run, and dollars for known models | ✅ |
| CST-03 | Cost before every run | The estimate under the Generate button and in the skill's own output | ✅ |
| CST-05 | Exploration budget | The skill keeps to a read budget sized to the repository | ✅ |
| CST-06 | Bench harness | A dev tool that runs agents on pinned repositories in isolation and records tokens, cost and results | 🟡 waits for a smoke run |

## I2 Accuracy

| ID | Feature | What it does | Status |
|---|---|---|---|
| ACC-02 | Evidence checks | Import graphs (Java, TypeScript, Python) check every arrow and find missing ones | ✅ |
| ACC-03 | Uncertainty on the map | Unsupported arrows and doubtful boxes drawn as such, with the reason | ✅ |
| ACC-04 | Eval scorer and ground truth | A dev tool that scores maps against hand-written reference architectures | 🟡 waits for a smoke run |
| ACC-05 | Audit | An agent pass checks each box against its cited code; verdicts show on the map | ✅ |
| ACC-06 | Flag a wrong box | Mark a box as wrong, with a note, and refresh just that box | ✅ |
| PRC-06 | Import-aware delta | New arrow candidates, and new box detection from imports | ✅ |

## I3 Architecture guardrails

| ID | Feature | What it does | Status |
|---|---|---|---|
| ARC-01 | Architecture rules | Declare dependencies that must not exist; violations show on the map, in Problems and in PR checks | ✅ |
| ARC-02 | Rules from the map | Right-click an arrow to forbid it; "Suggest rules" locks in today's clean separations | ✅ |
| ARC-03 | Hotspots | Boxes coloured by how often their code changes | ✅ |
| ARC-04 | Architecture notes for agents | The map and rules written into `AGENTS.md` for coding agents to follow | ✅ |
| ARC-05 | Architecture health | One sidebar panel: freshness, uncovered new code, violations, top hotspot | ✅ |
| PRC-03 | Branch maps | Before and after maps for a branch, and "Update map for this branch" | ✅ |
| PRC-05 | Map update in CI | Opt-in: the Action refreshes the map with your agent key and commits it to the pull request | 🟡 waits for a smoke run |

## I4 Skill retention

| ID | Feature | What it does | Status |
|---|---|---|---|
| SKL-01 | Explain-back | Before you merge, your agent asks three questions about the change and grades your answers privately | ✅ |
| SKL-02 | Guided tours | A step-by-step walk through the map: each stop opens the code, explains it and asks a question | ✅ |
| SKL-03 | Practice log | Your bug hunts, explain-backs and tours over time, on your machine | ✅ |
| LRN-01 | Learning sessions on Claude Code and Codex | Bug-hunt sessions launch and are enforced on Claude Code and Codex | 🟡 waits for a smoke run |
| LRN-02 | Java bug kinds | Bug-hunt sessions on Java code (CS2103) | ✅ |

## I5 Cloud for teams

| ID | Feature | What it does | Status |
|---|---|---|---|
| CLD-05 | Team dashboard | Freshness, uncovered code, violations and hotspots across a team's repositories, over time | ✅ |
| CLD-06 | Share links | Expiring read-only links to private maps | ✅ |
| CLD-07 | Plans and billing | Paid Team and Enterprise plans through Stripe | ✅ |
| CLD-10 | Self-hosting | The cloud as a Docker image | ✅ |
| CLD-12 | Share from the extension | Opt-in upload from VS Code, showing exactly what is sent | ⛔ needs your go |
| CLD-13 | Export and audit | Export all data; an upload audit log | ✅ |

## I6 Polish and reach

| ID | Feature | What it does | Status |
|---|---|---|---|
| FRS-07 | Compare maps | Added, removed and renamed boxes and arrows between two maps | ✅ |
| VWR-02 | Layout in workers | Large maps lay out faster and never freeze the panel | ✅ |
| VWR-03 | Finder | Find a box by name or file | ✅ |
| VWR-04 | Keyboard and screen readers | Use the map without a mouse | ✅ |
| VWR-05 | Drill down | Map one box in detail and come back | ✅ |
| VWR-06 | Image export | Save the map as SVG or PNG | ✅ |
| RCH-04 | More agents | Devin in Generate; ready-to-paste prompts for Copilot, Cursor, Gemini CLI and OpenCode | 🟡 waits for a smoke run |
| SET-04 | Messages that say what to do | Every message names what happened and offers one action | ✅ |
| SET-05 | Opt-in usage log | Local counts of key actions, exportable; off by default | ✅ |
| SAF-08 | Remove Sustain from a folder | One action removes everything Sustain added | ✅ |
| ENG-03 | Spec traceability check | Every feature has exactly one progress entry | ✅ |

## I7 IntelliJ plugin

| ID | Feature | What it does | Status |
|---|---|---|---|
| IDE-01 | IntelliJ plugin | The map in an IntelliJ tool window, with click-to-code | ⛔ needs a JDK and Gradle (the viewer side is built) |
