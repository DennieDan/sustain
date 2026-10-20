# Sustain vision

Why Sustain exists, who it is for, and how the team will judge it. This is context, not a contract: what gets built is [spec-v0.3.md](spec-v0.3.md).

## Motto

Sustainable engineering for the developer.

## Strategy

Deploy something ambitious, then trim and strengthen from real use. The spec's deploy track (D1–D6) ships the extension in the stores, the GitHub Action, and Sustain Cloud. The iterate track (I1–I7) is reordered from what users do.

CS3216 measures impact by users. A live product with real users is the strongest answer to the mentor. Two things are not trimmed before launch: the security fixes, and secret scanning before anything is uploaded. Those are what we couldn't defend later.

After launch, evidence comes without any telemetry in the extension:
- store installs;
- repositories using the Action (GitHub dependents);
- maps and checks uploaded to the cloud;
- weekly active repositories in the cloud;
- issues and stars;
- the study.

## Thesis

Sustain helps competent developers understand code they did not write, with a map where every box opens the code that proves it, kept accurate and cheap to refresh. The code might be a brownfield codebase such as the CS2103 team project, a new job, or a large change written by an agent or a teammate.

- **User.** A developer, student or professional, who reads the code they change. Two interviewees fit: B-T reads every line and C-K avoids autonomous agents. The open question is whether that care costs them time Sustain can save. Developers who don't read code are not the target.
- **Core.** The map plus click-into-code, the one feature both testers valued.
- **Against asking the agent.** A chat answer disappears with the session, costs a full exploration every time and cites nothing checkable. Sustain's map lives in the repository, is checked against the working copy, costs nothing to check for staleness or to overlay on a diff, refreshes only what changed, and can be reused as agent context. The bench and the study test these claims.

## Three debts

AI writes more of the code every month. That leaves three debts, and Sustain's features pay down each one.

| Debt | What it looks like | Features (spec) |
|---|---|---|
| Comprehension | "I merged it, but I don't know how it works" | The map and click-to-code; freshness and refresh; Ask; diagram page; tours (D2–D3; tours in I4) |
| Architecture | The structure drifts, boundaries leak, new code lands outside any known part | Delta report and PR checks, new box detection, rules with Problems-panel diagnostics, hotspots, architecture notes for agents, health (PR checks in D4; the rest in I2–I3) |
| Skill | Developers stop being able to work without the agent | Bug-hunt learning sessions, explain-back before merge, guided tours, practice log (I4) |

Comprehension and the free PR check ship first (deploy track): comprehension is the only validated signal, and the PR check is the visible hook for teams. Rules, hotspots and the skill features follow in the iterate track.

How the main flows work:
- **Cache and staleness.** Generating a map stores fingerprints (git blob ids and cited-range hashes) beside it. From then on, every open and every save re-checks each citation at zero tokens and marks it fresh, moved (still clickable), edited or missing. Refresh reuses the previous map as the draft and sends the agent only to edited or missing boxes and uncovered changes. Its cost scales with the change rather than the repository.
- **Delta and PR checks.** `sustain check` compares a diff with the committed map, at zero tokens. It finds:
  - touched boxes;
  - stale boxes;
  - new box candidates: new directories, or unowned code that gained 200+ lines, or files that import each other more than any box;
  - new arrows: imports between boxes the map doesn't connect;
  - gone boxes;
  - new rule violations.

  The editor shows them as ghost boxes and arrows with "Add to map". The GitHub Action posts the same report as a pull request comment with a Mermaid diagram and a pass/fail check. Opt-in, it can refresh the map with the team's agent key and commit it to the PR.

## Mentor feedback and where the spec answers it

| # | Feedback (CS3216) | Spec features |
|---|---|---|
| 1 | Four products in one pitch; keep the diagram-to-code signal and drop the rest | The feature list is the map and what keeps it trustworthy, current, accurate and reachable; dropped ideas below |
| 2 | Interviews contradict "juniors don't understand AI code" | Thesis above; study screening below |
| 3 | The agent itself is the main competitor; become part of the new workflow | PRC-01..05 (PR checks no chat can give), ARC-04 (the map steers the agent), UI-06 Ask about the map (the agent answers using the map), UI-02 runs streamed in the sidebar, CST-06 `baseline` and `assisted` bench kinds, FRS-01..06 |
| 4 | No target market; IntelliJ for CS2103; nobody interviewed uses VS Code | RCH-01 diagram page with JetBrains links, RCH-02 skill-only use, IDE-01 plugin |
| 5 | Trust | SAF-01..08, RCH-05 |
| 6 | Cost to users | CST-01..06 |
| 7 | Caching | FRS-01..06 |
| 8 | Diagram accuracy | ACC-01..06 |
| 9 | Life after CS3216 | The cloud business plan below (CLD-01..11); open decisions below |
| 10 | No test of whether it helps; no success measure; slow install; UX matters | Study below; UI-01..05 (sidebar, title buttons, status bar, menus: no Command Palette needed); SET-01..05 (one-click Generate) |

Ideas dropped after point 1, revived only if users ask: the predict-and-run test walkthrough; asking the user which layers a feature touches; dotted-block sketches of proposed architecture for new projects.

Point 1 is in tension with an ambitious deploy. The defence: everything shipped serves the map and click-to-code, and real usage, not opinion, decides what the iterate track keeps.

## Competitors

Full analysis: [market report](https://claude.ai/artifact/NX2U54Q8QD2xHZEPfJHkMM) (2026-10-16). The closest competitors:
- Archify, upstream: validated HTML diagrams with citations pinned to a public commit;
- the unofficial Archify Diagram Viewer for VS Code;
- Devin Desktop Codemaps;
- Nogic, which takes the same bring-your-own-agent approach;
- CodeViz, a paid in-editor map.

The open niche: a curated architecture, checked against the working copy, inside the editor, with no network calls from Sustain.

## Study

Two rounds, both on the deployed product. Round 1 runs right after D6, with real installs. Round 2 runs after the first iterate cycle, to measure whether it helped.

- **Design.** Counterbalanced within-subject: arms "agent alone" and "agent plus Sustain", two task sets on two comparable code areas, four orderings in rotation. Each round has 8–12 participants (at least 6) who have not worked on the study code, after a pilot with 2.
- **Screening.** The pre-survey asks: "When an AI tool or a teammate writes code you will keep, what do you do before accepting it?" Results are reported for the reads-the-code group first.
- **Materials.** Per task set:
  - a 10-minute orientation;
  - five comprehension questions with known answers, including "which file would you change to…";
  - one change-planning task scored against a file list;
  - a 1–5 confidence rating per answer.

  Also: pre-survey, post-survey ("would you use this when nobody asks you to?"), a day-7 follow-up, consent form and facilitator script. Diagrams are produced by the shipped skill, not hand-corrected.
- **Success measures, fixed before round 1.**
  - Primary: the median comprehension score with Sustain is at least the agent-alone score plus 1 of 5, with no rise in confident-and-wrong answers.
  - Secondary: change-planning file recall up 20 points; time not worse by more than 10%; at least 40% use Sustain again within 7 days unprompted (self-report plus the opt-in usage export, SET-05).
  - If the primary measure fails, revisit the thesis before continuing.
- **Interviews.** Ask about past behaviour, not opinions:
  - the last time you had to understand unfamiliar code: what you did, how long it took, what it cost;
  - the last time you asked an agent to explain a repository: what happened next.

  Use A-Q's "why not just ask Codex?" as a probe. Follow up with B-T and C-K on whether reading every line, or avoiding agents, is a cost they want removed.
- **Ethics.** NUS-IRB guidance for student research (IRB-GUIDE-018) separates two cases:
  - class exercises not construed as research need no review;
  - anything published or presented outside the course needs departmental (DERC) or NUS-IRB review before any data is collected. CITI training is required for social and behavioural research from 1 March 2026.

  Decide which case applies, and confirm it and the consent form with the CS3216 teaching team before round 1.

## Outcome targets

Measured with the spec's bench (CST-06) and eval (ACC-04) tools. They are goals, not build criteria.

| Target | Goal |
|---|---|
| Estimate band (CST-02) | At least 80% of bench runs inside `[low, high]`, median `high / low` at most 2.0 |
| Refresh cost (FRS-05) | Median refresh at most 35% of the median full run's tokens; at least 90% of unaffected boxes keep id and label |
| Accuracy on AB3 and MarkBind with Claude Code (ACC-04) | Component recall ≥ 0.8, precision ≥ 0.7, at most 1 grouping error per diagram; also on held-out RepoSense |
| Evidence checks (ACC-02) | At least 80% of 20 or more pooled `UnsupportedEdge` warnings agree with ground truth |
| Behaviour rule (ACC-01) | Declaration-only boxes and grouping errors fall against the pre-change baseline |
| Exploration budget (CST-05) | Median reads per run within the tier budget, with recall no lower |
| Layout (VWR-02) | NFR-PERF-01 median on the owner's WSL machine down at least 40% |
| New box candidates (PRC-01) | Every directory added by a corpus `changeTo` patch is flagged; under 1 false candidate per pull request on average |
| Time to first diagram | Median 5 minutes or less, at most 2 decisions, Node and agent install excluded |

## Bench budget

Bench runs cost money, and each one needs a separate API key, never the implementer's own session. Proposed cap: US$150 in total. `npm run bench:plan` projects each series from one small run per agent, and the series stops for an owner decision past 80% of what remains. At most 5 runs per session.

## Distribution and launch

- **Channels.** VS Code Marketplace, Open VSX (needed by Cursor and Devin Desktop), GitHub releases, `npx skills add` (skills.sh), a Claude Code plugin marketplace, and JetBrains Marketplace for the plugin.
- **Deadline.** Global Azure DevOps personal access tokens are retired on 1 Dec 2026; Marketplace publishing then needs Microsoft Entra ID (`vsce publish --azure-credential`). A domain registered now starts the six-month clock for the Marketplace's verified badge.
- **Open VSX** rejects packages without a licence. Publishing there waits for the licence decision.
- **Launch.** D6 ships publicly. Announcements (Show HN, Reddit, course channels) follow once the first real users' bugs are fixed.
- **After the gate.** Show HN, Reddit (r/ClaudeAI, r/codex, r/cursor, r/vscode), Console.dev, a note to the Archify maintainer, and CS2103 through its teaching team. Set first-four-weeks targets: installs, repositories with a committed diagram, issues opened.

## Sustain Cloud: business plan

The extension stays free and local. The cloud is for teams, and it stores **maps, not code**: Archify maps, their sidecars, check results and metadata. The upload API rejects everything else (spec CLD-02), and the privacy page publishes the schema.

- **Who pays.** Team leads and engineering managers who want the map, its freshness and the PR checks across many repositories. Developers use everything for free.
- **Wedge.** The free GitHub Action (PRC-04) already comments on every pull request with zero tokens and no Sustain server. Turning on `upload` adds pull request pages, history, the dashboard and share links: the reason to pay.
- **Where the code is read.** Agents and checks run on the customer's machines or CI runners, with their own keys. Sustain never sees code or pays for inference. Its margins stay software margins.
- **No per-person metrics, ever.** The dashboard aggregates per repository. A developer tool that turns into a surveillance tool loses its users.
- **When to build it.** Cloud v1 (map and PR pages, uploads, free during beta) ships in the deploy track (D5). Paid plans, the dashboard and self-hosting wait for the iterate track (I5). A sensible gate before charging: about 10 teams uploading every week.
- **Running costs.** One web app and one Postgres database. No inference, no code storage.

Plans (prices proposed, kept in `cloud/plans.ts` configuration):

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | Unlimited public repositories, 1 private repository, 30 days of history, public gallery |
| Team | Proposal: $12 per seat per month | Private repositories, full history, PR pages, dashboard, share links |
| Enterprise | Quote | Self-hosted image (CLD-10), no data leaves the company, support |

For comparison: AppMap Team $15 per developer, CodeViz Teams $50 per seat, IcePanel $40–80 per editor.

## Open decisions

| Decision | Notes |
|---|---|
| Licence | Deferred. The packaging works without one; Open VSX publishing waits until there is one |
| Public repository | Needed for `npx skills add`, CI and Open VSX |
| Learning sessions | Keep experimental, or promote |
| Store display name | Proposal: "Sustain: Code-Linked Architecture Maps" |
| Bench budget | Proposal: US$150 |
| Study design and success measures | Sign off before round 1 |
| After CS3216 | Maintainers, release cadence; the cloud plan above as the funding path |
| Cloud name and domain | Needed for OAuth callbacks, the Action's OIDC audience and the site |
| Cloud hosting | Proposal: a managed Node host with managed Postgres; the self-host image covers Enterprise |
| Team price | Proposal: $12 per seat per month |
| Extension network exception | Not at deploy: uploads go through the CLI and the Action only. CLD-12 (iterate) would let one opt-in file reach the cloud |
| Committed maps | PR checks need the map committed in `.archify/`; the README will say so |

## Problems found in the current code

These motivate the spec's SAF features.

- **Substituted skills.** Generate and Start Learning only check that `SKILL.md` exists. A repository can therefore ship its own `sustain-*` skill. Claude Code applies a project skill's pre-approvals even in untrusted folders.
- **Arbitrary commands through pre-approvals.** The bug-hunt skill pre-approves `Bash(node …/scripts/*)`. In Claude Code the `*` matches any arguments. `session.mjs verify --check-cmd "<anything>"` runs a shell command without a prompt.
- **Edits that become execution.** The bug-hunt skill also pre-approves `Edit` and `Write` on any path. Injected text can rewrite a pre-approved script and then run it.
- **Writes outside the repository.** `.gitignore` and hook merges, and skill copies, follow symlinks out of the repository.
- **Hooks that never leave.** Install merges a repository-local hook that runs on every Devin session start and prompt, even for users who only want diagrams.
- **Notices and licence.** `THIRD_PARTY_NOTICES.md` omits the bundled elkjs, ajv and fast-uri, and there is no licence.
- **Broken skill installs.** `skills/<name>/` has no built scripts. `npx skills add` on a public repository would install broken skills.
- **Partial enforcement.** Learning-session enforcement covers the Devin CLI only.
- **Slow layout.** A 60-box layout takes about 1.1 s on the owner's WSL machine, against about 200 ms on the original build machine.

## Risks

| Risk | Mitigation |
|---|---|
| Agent CLI flags and outputs change | Parsers with recorded fixtures; smoke checks |
| Permission-rule semantics differ from the docs | Smoke checks; fallbacks recorded in ADRs |
| JetBrains deep links are undocumented | Several open targets and copy fallbacks |
| The eval rewards copying documentation | Strip lists and a held-out repository |
| The study is too small for statistics | Measures fixed in advance; two rounds; per-participant reporting |
| Ethics review delays round 1 | Decide early |
| The term ends before late milestones | The deploy track ships first; round 1 runs on the live product |
| New box candidates are noisy | `ignore` globs in `sustain.config.json`; thresholds tuned on the corpus |
| Wrong maps reach strangers at launch | ACC-01 ships in D3; the cloud and the extension label beta; "This box is wrong" (ACC-06) comes early in iterate |

## Owner tasks

1. Settle the open decisions above.
2. Push `kerk` and enable GitHub Actions.
3. Settle ethics and the consent form; recruit participants; run the pilot and both rounds; record results in `research/results/`.
4. Provide bench API keys, separate from the implementer's session.
5. Run the smoke checks listed under Waiting in progress, plus the items left open from v0.1 and v0.2 (FR-LIVE-02 for Codex, document reviews).
6. Review the ground-truth files.
7. Set up publishing accounts and secrets: Marketplace with Entra ID; Open VSX (Eclipse account, agreement, token, namespace); JetBrains Marketplace (the first upload is manual).
8. Record the demo GIF.
9. Install a JDK and Gradle 9 if the IntelliJ plugin (IDE-01) is built.
10. For the cloud (D5–D6): register the domain, create the GitHub OAuth app, choose hosting and Postgres, and approve each deployment. Stripe waits for I5.
