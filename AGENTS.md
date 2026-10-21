# Sustain

Sustain is a VS Code extension with agent skills. A coding agent maps a repository into a diagram whose boxes open the code they cite. Bug-hunt learning sessions are an experimental second track.

## Current work

`docs/spec-v0.3.md` is the contract and `docs/progress-v0.3.md` the state of the v0.3 build on branch `kerk`. Follow the spec's resume protocol (§7) at the start of every session. `docs/vision.md` explains why a feature exists. It adds no requirements.

## Working agreement

- Build exactly what the spec describes. Ambitious ideas go into the progress log as suggestions, and the code stays minimal.
- The build runs in advance mode. Keep moving without waiting for the owner. Only the hard stops in the spec's §7 pause a feature, and other work continues meanwhile.
- Before a milestone's first line of code, write its proposal table into progress. Give one row per file or logical unit, with the change and an estimated size such as `+40 / -12`, then list the tests the milestone's ACs call for.
- When the build departs from the spec or the proposal, record what changed and why in the progress log and carry on. The divergence never ships unannounced.
- When a milestone closes, add a Built column with the real sizes and a list of where the build differs. Keep the approved table as it was.
- Make small changes, one idea per commit. The history should read as the product being built up.
- Ask before settling anything genuinely debatable. Make routine calls yourself and say what you assumed.
- Write docs only when the spec or the owner asks for them.
- Others edit this repository between sessions. Re-read a file before changing it, and check `git status` and `git log` at the start of each session.
- Describe conventions on their own merits. Name no other project or repository in commits, docs or comments.

## Writing style

These rules cover docs, code comments, test comments and commit messages.

- **Lead with what happens.** State the behaviour or the instruction first, then any condition or exception.
- **Give each idea its own sentence.** A reason or a consequence starts a new sentence, rather than following a colon or a ", so".
- **Describe intended behaviour in positive terms,** rather than what a check guards against.
- **Explain only what a reader would ask about.**
- **Write full sentences,** without arrows or fragment shorthand.
- **Say investigation or research,** never spike.

For example, "A skill whose files differ from the bundled copy is reinstalled before launch." replaces "Integrity check: guards against tampered skills, so we reinstall."

## Tests

- Write the tests a feature's AC calls for and no others.
- A test's comment states the behaviour it checks and claims only what the test asserts.
- Break the behaviour once on purpose and see the test fail before keeping it.
- Test our code. Library behaviour and test helpers get no tests of their own.
- Run the tests as their own step and read the result before committing. A pipe such as `| tail` reports the last command's exit status and hides a failure.

## Git

- Commit each finished feature on `kerk` after its gates pass, as `v0.3 <IDs>: <summary>`. Stage only that feature's files.
- The owner pushes and merges. Leave `origin` and `main` alone.
- Before any revert, reset, rebase, merge, amend or squash, state the exact resulting history and wait for a yes.

## Installs

Install nothing without the owner's go. That covers toolchains, system packages, browsers, agent CLIs and every new npm dependency, including Playwright's browser download. List exactly what is needed, with versions, and wait.

## Repository hygiene

Keep tool output and scratch files out of the repository. Build and probe in the session's scratchpad or in the folders git already ignores (`dist/`, `out/`, `node_modules/`).

## Shell and environment

- Non-interactive shells resolve `node` to system Node 18. The toolchain needs Node 22.12 or newer, and `.nvmrc` pins 26. Start every command that runs `node`, `npm` or `npx` with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.
- Run tools through the npm scripts or `node_modules/.bin`. A bare `npx <tool>` can pick up a stale cache built for Node 18.
- Unset `ELECTRON_RUN_AS_NODE` before `npm run test:e2e`. Terminals inside editors set it.
- Other agent sessions run on this machine at the same time. Give any server or database you start its own port and name, and remove it afterwards.
- Docker Desktop's WSL integration drops out and comes back. Run `docker version` before concluding Docker is off.
- WSL forwards only IPv4 to Windows. A server meant for a Windows browser listens on `0.0.0.0`.
- Headless Chromium here lacks `libnss3` and `libnspr4`, and there is no sudo. With a go, `apt-get download` both into the scratchpad, extract each with `dpkg -x`, and set `LD_LIBRARY_PATH` to the extracted `usr/lib/x86_64-linux-gnu` for the browser run.

## Gates

`npm run check` (typecheck, tests, docs check, build) and `npm run test:e2e` are green before every commit. Once `cloud/` exists, its tests join the gates.

## Decisions

Write an ADR only for a security property, a data format, a new runtime dependency, or a change to an accepted ADR. Use the MADR template in `docs/adr/`, keep it short, and add it to the index in the same change. `npm run check:docs` checks both. Every other decision gets one line in the progress log. Earlier contracts: `docs/spec.md` (v0.1 viewer) and ADRs 0029–0040 (learning sessions).
