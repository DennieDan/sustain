# Sustain

Sustain draws your repository's architecture as a map that opens the code behind every box and tells you when the code has moved on.

A coding agent you already use writes the map. Sustain supports Claude Code and Codex, and gives them a skill to follow. Each box cites the lines it describes, and a click opens them. Sustain compares every box with the code it cites. It shows which boxes have changed without spending a token.

Maps use the [Archify](https://github.com/tt-a1i/archify) JSON format (`schema_version: 1`). Sustain is not affiliated with Archify.

## Quick start

Generating a map needs Node.js 18 or newer and Claude Code or Codex, installed and signed in. Viewing a map needs neither.

### VS Code, Cursor or Devin Desktop

1. Download `sustain-<version>.vsix` from the [latest release](https://github.com/xplus2g4/sustain/releases) and choose **Install from VSIX…** in the Extensions view.
2. Click the Sustain icon in the Activity Bar.
3. Type an optional focus, such as "payment flow", and click **Generate**.

The sidebar's setup checklist names anything missing and offers a fix for each.

### IntelliJ and other JetBrains IDEs

1. Add the skills with `npx skills add xplus2g4/sustain`.
2. In the repository, run `/sustain-architecture` in Claude Code or `$sustain-architecture` in Codex.
3. Open the `.html` page the skill writes in `.archify/<run>/`. Each box opens its code in your JetBrains IDE, VS Code, Cursor or GitHub.

### Skill only

1. Add the skills with `npx skills add xplus2g4/sustain`.
2. Run `/sustain-architecture payment flow` in Claude Code or `$sustain-architecture payment flow` in Codex. The focus is optional.
3. Open the `.html` page beside the map in a browser, or open the map in the Sustain extension.

### Claude Code plugin

1. Download `sustain-skills.zip` from the [latest release](https://github.com/xplus2g4/sustain/releases) and unzip it with `unzip sustain-skills.zip -d sustain-skills`.
2. In Claude Code, run `/plugin marketplace add ./sustain-skills`.
3. Run `/plugin install sustain@sustain`.

### GitHub Action

1. Commit a map, as [Commit your map](#commit-your-map) describes.
2. Add `.github/workflows/sustain.yml`.

   ```yaml
   name: Sustain
   on: pull_request
   permissions:
     contents: read
     pull-requests: write
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with:
             fetch-depth: 0
         - uses: xplus2g4/sustain/action@main
   ```

3. Open a pull request. Sustain comments with the boxes it touches, the boxes it leaves stale and the code no box covers.

Setting `fail-on: stale,new-box` in the Action's `with:` block fails the check on those findings. Setting `refresh: claude` or `refresh: codex` there updates the map on the pull request's branch when it has new folders or changed boxes. It needs that agent's CLI and API key in the job, the pull request's head checked out, and `contents: write`, and it never runs for a fork. Replace `main` with a release tag to pin a version.

### Sustain Cloud

1. Sign in to Sustain Cloud with GitHub, open your repository's settings and create an upload token.
2. On the default branch, run `node sustain.mjs publish --url <cloud address>` with the token in `SUSTAIN_TOKEN`. `sustain.mjs` comes with each [release](https://github.com/xplus2g4/sustain/releases).
3. In the Action's `with:` block, set `upload: true` and `cloud-url: <cloud address>`, and add `id-token: write` to the permissions. Each pull request then gets its own page.

The map appears at `/<owner>/<repo>` and each pull request at `/<owner>/<repo>/pull/<n>`. Accounts start on Free, which keeps maps of one private repository and 30 days of history. Team, bought per seat in Settings, adds every private repository, all history, pull request pages, the dashboard and share links. A self-hosted server without Stripe keys gives every account everything. To host it yourself, set `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from a GitHub OAuth app, and run `docker compose -f cloud/docker-compose.yml up --build`. In a repository's settings, owners make read-only share links to its map that expire after 1, 7 or 30 days and can be revoked. `/<owner>` is the team's dashboard: each repository's map age, stale boxes, uncovered files, rule violations, most changed boxes, trend and recent pull requests, with no figure about any one person. Only maps and check results are uploaded, never code.

## Where to find it

Every command is also in the Command Palette under "Sustain".

| Place | What's there |
|---|---|
| Activity Bar | The Sustain icon, which opens the sidebar |
| Sidebar | The folder and its map status, the composer (focus, agent, run mode and Generate), the live run, your maps, Review changes, the setup checklist, Practice, learning sessions and Ask |
| Sidebar title bar | Refresh and Check Setup |
| Editor title, any file | Show in Map |
| Editor title, map | Refresh Architecture, Show Changes on Diagram, Export Page, Audit Map, Show Hotspots and Tour, with Compare With…, Write Architecture Notes for Agents and Create Tour in its menu |
| Status bar | Sustain's state, the time of a running generation or the number of changed boxes. A click opens the sidebar. |
| Explorer right-click | Map This Folder with Sustain, and Show in Architecture Map |
| Box right-click | Open Code, Refresh This Box, This Box Is Wrong…, Check My Understanding, Only Allow Imports From… and Route Dependencies Through… |
| Arrow right-click | Forbid This Dependency |
| Maps list | Open, Refresh, Export page, Create tour and Delete on each map |
| Pull request | The Sustain check and its comment |
| Sustain Cloud | Map pages with their tours, pull request pages, the team dashboard, the docs and a gallery of public maps |

## Using the map

- Click a box to open the code it cites, with the cited lines selected.
- Hover a box to see its description and every source it cites.
- Drag or scroll to pan. Zoom with Ctrl or ⌘ and scroll, a pinch, the toolbar or the keys `+`, `-`, `0` and `f`.
- A badge marks each box whose code was edited or removed since the map was made. Moved code still opens at the right lines.
- **Show Changes on Diagram** marks the boxes touched by your uncommitted changes, your branch or a commit range, and lists the changes no box covers.
- **Refresh Architecture** asks your agent to update only the boxes whose code changed.
- **Export Page** writes the map as one HTML file that opens anywhere.
- **Ask** in the sidebar answers questions about the map, with links to the lines it cites.
- **Tour** in the map's title bar plays the map's tour. Each stop marks a box, opens its code beside the map, explains it and asks a question, and **Show answer** gives the answer. **Create tour** in the maps list asks your agent to write one.
- **Audit Map** asks your agent to check each box against its cited code. Doubtful boxes are drawn dotted, and arrows with no import evidence grey and dashed. **Hide Checks** in the map's title bar hides them.
- **This Box Is Wrong…** on a box saves your note beside the map and offers to refresh that box.
- **Health** at the top of the sidebar says whether boxes changed since the map, how many changed lines no box covers, whether any import breaks a rule, and which box changes most. Each line opens its view.
- **Review changes** in the sidebar compares a branch with its base. When the branch has its own newer map, **Compare with base map** draws what changed, and **Update map for this branch** refreshes the map for the new folders and changed boxes the review found.
- **Compare With…** in the map's title-bar menu draws what changed since another map. New boxes and arrows are outlined, and removed ones are drawn see-through. Sustain Cloud's map history offers the same.
- **Write Architecture Notes for Agents** puts the map's boxes, arrows and rules into `AGENTS.md`, between Sustain's markers, so coding agents follow the architecture. It writes `CLAUDE.md` too when that file does not import `AGENTS.md`. Your own text stays as it is, and each file shows as a diff first.
- **Show Hotspots** in the map's title bar tints each box by how often its code changed over the last 90 days (`sustain.hotspots.days`). The tooltip gives the commits, lines changed and number of authors, and the sidebar lists the five busiest boxes.
- **Practice** in the sidebar checks your understanding of this branch's changes, the uncommitted changes or a box. Your agent asks three questions, and grades each answer with a link to the code. The expected answers never reach the sidebar, and the results stay in VS Code's storage for the workspace. Below them, the section lists your finished bug hunts, explain-backs and tours, with their dates.
- **Rules** in `sustain.config.json` say which boxes may import which. An import that breaks one shows in the Problems panel at its line, as a red arrow on the map, and in the pull request check. Right-click an arrow to forbid it or a box to limit who imports it, or use Suggest rules in the sidebar. Every change to the file shows as a diff first.

## Commit your map

Each map lives in its own run folder in `.archify/`, named after its focus and the time it was made. Commit the folder. Teammates, the pull request check and Sustain Cloud all read the committed map.

- `candidate.json` is the map.
- `fingerprints.json` holds hashes of the cited code. Sustain uses them to find the boxes that changed.
- `run.json` records how the map was made, and `evidence.json` what the validator checked.
- `audit.json` holds the audit's verdict on each box, and `feedback.json` your notes on boxes that are wrong.
- `tour.json` holds the map's tour. Sustain Cloud plays it on the map's page.
- `draft.json` and the `.html` page stay out of commits. Sustain lists them in `.git/info/exclude`.

Name the map that checks compare with in `sustain.config.json` at the repository root.

```json
{ "map": "architecture-payment-flow-20261018-101500" }
```

Without it, checks use the newest map with an empty focus.

## What it costs

Sustain makes no AI calls of its own. Your agent does the work, on your account.

- Generating a map uses your agent's tokens. On an API account they are billed at the model's price. On a subscription they count towards your plan's limits.
- Before every run, Sustain states an estimate under Generate, in the confirmation and on the run card, such as "About 180k–260k tokens (about $0.50–$0.80 at API prices; on a subscription it uses part of your plan's limit)". The skill states it too. Runs above `sustain.confirmAboveTokens`, 300,000 tokens by default, need a second click.
- A run in the sidebar shows its elapsed time and tokens as it goes, and the final tokens and cost when the agent reports them. `run.json` keeps the figures.
- Refresh reads only the code that changed since the map was made.
- Ask spends tokens on each question, Practice on its questions and on each grade, and Create tour once per tour.
- Viewing a map, the freshness badges, Show Changes, Review changes, the diagram page and the pull request check spend no tokens.

## What it touches on your machine

- Skills go to `~/.agents/skills/`, which Codex and Devin read, with links in `~/.claude/skills/` for Claude Code. With `sustain.skillScope` set to `project`, they go to `.agents/skills/` and `.claude/skills/` in the repository.
- Maps go to `.archify/` in the repository.
- `.git/info/exclude` gains `.sustain/`, `.archify/**/draft.json` and `.archify/**/*.html`. Git reads this file and never commits it.
- Learning sessions keep their state in `.sustain/`. Their hook entry exists only while a session runs, in `.claude/settings.local.json` for Claude Code, `.codex/hooks.json` for Codex or `.devin/hooks.v1.json` for Devin. Codex runs it once you trust it with `/hooks`.
- Agents run with an exact list of tools. Claude Code may read, search, run the skill's scripts and edit inside `.archify/`. Codex runs in its workspace sandbox. No permission prompt is skipped.
- The extension makes no network requests. Only `sustain publish` and the Action's `upload: true` send anything, and they send maps and check results.

## How to remove it

1. Uninstall Sustain from the Extensions view.
2. Delete `sustain-architecture`, `sustain-refresh`, `sustain-audit`, `sustain-tour` and `sustain-bugfix` from `~/.agents/skills/` and `~/.claude/skills/`.
3. In each repository you mapped, delete `.archify/` and `.sustain/` if you no longer want them, and the three Sustain lines from `.git/info/exclude`.

To leave Sustain Cloud, choose **Delete my account** in its settings. Your account and every repository space it owns are removed at once.

## License notices

[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), shipped with the extension, lists the Archify material (MIT) included in Sustain.
