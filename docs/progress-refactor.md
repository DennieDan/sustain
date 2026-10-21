# Progress (refactor)

Tracks [spec-refactor.md](spec-refactor.md). Milestone statuses: Not started, In progress, Closed pending owner, Closed. Tick a feature only when its AC has passed, and write the evidence next to it: test names, commands and results. `[smoke]`, `[ci]` and `[manual]` items that need the owner go under Waiting.

## Status

| Milestone | Status | Branch | Commit |
|---|---|---|---|
| RF0 Adoption | Not started | `refactor/rf0-adoption` | |
| RF1 Dead code | Not started | `refactor/rf1-dead-code` | |
| RF2 Shared helpers | Not started | `refactor/rf2-shared-helpers` | |
| RF3 Unit folders | Not started | `refactor/rf3-unit-folders` | |
| RF4 Isolate learn | Not started | `refactor/rf4-isolate-learn` | |
| RF5 Skills independence | Not started | `refactor/rf5-skills` | |
| RF6 One check flow | Not started | `refactor/rf6-check-flow` | |
| RF7 Viewer host | Not started | `refactor/rf7-viewer-host` | |
| RF8 Split hotspots | Not started | `refactor/rf8-hotspots` | |
| RF9 Architecture docs | Not started | `refactor/rf9-architecture-docs` | |

## Waiting

Nothing yet.

## Decisions

The owner settled these on 2026-10-21, before the spec was written.

- The refactor gives each product surface clear boundaries. The skills work in any repository, and the diagram viewer works in any host.
- Behaviour stays the same where possible. A change that a boundary requires is logged here and committed on its own.
- The refactor covers `main`. Cloud, bench, eval, IntelliJ, refresh and tour are out of scope, and their leftovers are deleted. `kerk` keeps them.
- The bug-hunt track stays and is isolated behind one seam in `extension.ts`.
- The work ships as one small pull request per milestone into `main`. Other contributors merge into `main` at the same time.
- The spec and progress log are drafted in `.scratch/` and move to `docs/` in RF0.
- There are eight units, as folders in one package. `boundaries.test.ts` enforces the import rules. No npm workspaces.
- The viewer starts through an injected `ViewerHost` and styles itself only with `--sustain-*` tokens. A browser test host proves that it is independent of VS Code.
- Only the diagram viewer is portable. The sidebar and session panel stay VS Code UI.
- Both skills must work from a fresh copy in a bare repository.
- Every move is a pure `git mv` commit, and the edits follow in later commits.
- Tests that pin file paths keep their checks with the new paths. The per-file allowlists in `boundaries.test.ts` give way to unit rules.
- `npm run check` and `npm run test:e2e` gate every pull request.
- Two ADRs are written: "Unit boundaries" and "Viewer host contract". The ADRs for dropped features are marked Superseded, and the duplicate ADR numbers stay as they are.
- `spec-v0.3.md` and `progress-v0.3.md` are marked historical. `AGENTS.md` points at the refactor docs.
- A hotspot counts as split when each of its named concerns has its own module. There is no line-count cap.
- The hook merge and removal logic moves into `src/learn`, and `session.mjs` and the extension share it. `session.mjs init` installs the hooks, and `complete` and `abandon` remove them.

Calls made while writing the spec:
- The spec writes `session.mjs init`, `complete` and `abandon` where the interview said "start" and "end". These are the subcommands the script has today.
- `inject` waits until the hook has fired once. A session therefore reaches `hunting` only when its hook is live, whether or not the agent reloads hook files.
- RF0 is added ahead of RF1 to cover the move to `docs/`, the `AGENTS.md` change and the baseline gate run.

## Suggestions

- Validate webview messages at runtime on the host side.
- Build a standalone viewer host (a diagram page) and an IntelliJ JCEF host on the `ViewerHost` contract.
- Promote units to npm workspaces once a second package needs them.

## RF0 Adoption

Proposal:

| File or unit | Change | Estimate |
|---|---|---|
| `docs/spec-refactor.md`, `docs/progress-refactor.md` | Move from `.scratch/` into git. The spec's status line says the owner approved it. | +465 / -0 |
| `scripts/check-docs.mjs` | Trace each spec and progress pair from one table, the v0.3 pair and the refactor pair. | +15 / -8 |
| `test/unit/checkDocs.test.ts` | Name the progress file in `checkTraceability` calls, and add the refactor tracing test. | +12 / -4 |
| `docs/spec-v0.3.md`, `docs/progress-v0.3.md` | A status line that marks each historical. | +2 / -0 |
| `AGENTS.md` | Current work, Git, and Shell and environment. | +10 / -8 |

Tests the AC calls for:
- `RFX-01 check:docs traces the refactor spec and fails when an RFX ID is missing from its progress checklist` in `test/unit/checkDocs.test.ts`.
- The existing `the repository's own docs pass` covers the real `docs/` folder.

- [ ] **RFX-01 Refactor docs adopted** `[unit]`

## RF1 Dead code

- [ ] **RFX-02 Dropped features removed** `[unit]`
- [ ] **RFX-03 Build, CI and test leftovers removed** `[unit]` `[e2e]`

## RF2 Shared helpers

- [ ] **RFX-04 One copy of each shared helper** `[unit]`
- [ ] **RFX-05 One argument parser for the scripts** `[unit]`
- [ ] **RFX-06 One git output parser** `[unit]`
- [ ] **RFX-07 One set of webview DOM helpers** `[dom]`

## RF3 Unit folders

- [ ] **RFX-08 Unit folders** `[unit]` `[e2e]`
- [ ] **RFX-09 Unit import rules** `[unit]`
- [ ] **RFX-10 Protocols owned by their units** `[unit]` `[dom]` `[e2e]`
- [ ] **RFX-11 Unit boundaries ADR** `[unit]`

## RF4 Isolate learn

- [ ] **RFX-12 Learn unit** `[unit]` `[e2e]`
- [ ] **RFX-13 Learn reached through one seam** `[unit]` `[manual]`

## RF5 Skills independence

- [ ] **RFX-14 Architecture skill in any repository** `[unit]`
- [ ] **RFX-15 Bug-hunt hooks owned by the skill** `[unit]`
- [ ] **RFX-16 Bug-hunt skill in any repository** `[unit]` `[smoke]`

## RF6 One check flow

- [ ] **RFX-17 One check flow** `[unit]` `[ci]`

## RF7 Viewer host

- [ ] **RFX-18 Viewer host contract** `[unit]` `[e2e]`
- [ ] **RFX-19 Viewer theme tokens** `[unit]` `[smoke]`
- [ ] **RFX-20 Viewer test host** `[dom]`
- [ ] **RFX-21 Viewer host ADR** `[unit]`

## RF8 Split hotspots

- [ ] **RFX-22 Session referee split** `[unit]`
- [ ] **RFX-23 Git module split** `[unit]`
- [ ] **RFX-24 Sidebar host split** `[e2e]`
- [ ] **RFX-25 Sidebar and changes views split** `[dom]`

## RF9 Architecture docs

- [ ] **RFX-26 Architecture docs** `[unit]` `[manual]`
