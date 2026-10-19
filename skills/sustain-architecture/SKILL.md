---
name: sustain-architecture
description: Generate or update an Archify architecture diagram of this repository for the Sustain VS Code viewer. Invoke manually with an optional focus.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(node .agents/skills/sustain-architecture/scripts/*)
---

# Sustain architecture diagram

Produce one validated Archify architecture diagram of this repository. The Sustain VS Code viewer draws it and opens the cited code when a node is clicked, so every node must point at real code. When an earlier diagram of the same scope exists, update it instead of drawing a new one, so that unchanged parts keep their IDs and text. Follow these steps in order, from the repository root, without asking the user for more input.

## Paths you never open

Never open, search or cite these paths (any folder depth, any letter case):

- `.git/` and `.archify/`
- `.env` and `.env.*` (except `.env.example` and `.env.sample`)
- `.npmrc`, `.pypirc`, `.netrc`
- files whose names start with `id_rsa` or `id_ed25519`
- files ending in `.pem`, `.key`, `.p12` or `.pfx`

The one exception is step 5: in update mode you read the previous candidate, `mapping.md` and `change.md` named by `change-map.mjs`, and no other file under `.archify/`; you never cite them.

## 1. Read the focus

The focus is: $ARGUMENTS

- In Claude Code the line above holds the text typed after `/sustain-architecture`.
- In Codex the focus is the text after the `$sustain-architecture` mention; ignore the line above if it still reads as a placeholder.
- If the focus starts with the token `--regenerate`, remove that token from the focus and remember to pass `--regenerate` in step 3.
- If the focus is empty, draw a whole-system overview led by the main user journey.

## 2. Create the run folder

Run, from the repository root:

```sh
node .agents/skills/sustain-architecture/scripts/repo-facts.mjs --focus "<focus>"
```

Omit `--focus "<focus>"` entirely when the focus is empty. The script prints one JSON object. Keep its `runFolder`, `draft` and `git` values; `git` lists uncommitted paths whose line numbers may still change. If it exits non-zero, stop and report its stderr.

## 3. Choose update or regenerate

Run, from the repository root:

```sh
node .agents/skills/sustain-architecture/scripts/change-map.mjs --run-folder <runFolder>
```

with `<runFolder>` replaced by the `runFolder` value from step 2, and `--regenerate` appended when step 1 asked for it. The script prints one JSON object; keep it. Its `mode` is `update` or `regenerate`; `previous` is the previous candidate (or `null`); in update mode `changeFile` and `mappingFile` name the change description and the mapping of changed files to components. If it exits non-zero, stop and report its stderr.

## 4. Read the format reference

Read `.agents/skills/sustain-architecture/references/archify-format.md` completely. Use `.agents/skills/sustain-architecture/references/example.json` only as an example of the JSON shape, never as content.

## 5. Update mode (`mode` is `update`)

Skip this step in regenerate mode.

1. **Read what changed.** Read the `previous` candidate, the `mappingFile` and the `changeFile`. `mapping.md` lists the components whose cited files changed with their changed hunks, the components whose cited files did not change, and the changed files no component cites.
2. **Re-explore only what changed.** Re-read the current code of the components listed as having changed cited files, and of each changed file that no component cites; for each such file decide whether it belongs to an existing component, needs a new component, or is not architectural. Do not re-explore the other components. The rules of "How you work" in `archify-format.md` and the paths above still apply.
3. **Write the draft.** Start from the previous candidate. Update the components with changed cited files (type, label, sublabel and citations), and add, remove, split or merge components where the changed code requires it. Update the connections and boundary membership of those components. Keep every component whose cited files did not change exactly as it is (`id`, text and citations), unless a changed file creates a new relationship with it; then add only that connection. Keep the IDs of everything you keep; new elements get new unique IDs; never reuse an ID for an element with a different responsibility. Every connection needs a unique `id`. Write the complete diagram as JSON to the `draft` path from step 2. Write nothing else, anywhere: no other files, no edits to existing files.

## 6. Regenerate mode (`mode` is `regenerate`)

Skip this step in update mode.

1. **Explore the code.** Use your own read and search tools, in the order given under "How you work" in `archify-format.md`. Do not open the previous candidate.
2. **Write the draft.** Write the complete diagram as JSON to the `draft` path from step 2. Every connection needs a unique `id`. Write nothing else, anywhere: no other files, no edits to existing files.
3. **Re-attach the previous IDs.** If `previous` is not `null`, run, from the repository root:

   ```sh
   node .agents/skills/sustain-architecture/scripts/match-ids.mjs <draft> --previous <previous>
   ```

   with `<draft>` and `<previous>` replaced by the values from steps 2 and 3. It rewrites the draft in place, giving matched components and connections their previous IDs. If it exits 2, continue with step 7; the validator reports what is wrong with the draft.

## 7. Validate and repair

Run, from the repository root:

```sh
node .agents/skills/sustain-architecture/scripts/validate.mjs <draft>
```

with `<draft>` replaced by the `draft` path from step 2. It prints one JSON object with `status`.

- `rejected`: fix exactly the entries listed in `errors` (each names a JSON pointer such as `/components/3/sources/0/end_line`; re-read a cited file if you are unsure of its length), rewrite the whole draft at the same path, and run the validator again. `warnings` list fields the validator removed for you; they need no action.
- You may repair at most 3 times (4 validator runs in total). After the 4th rejection, stop and report the remaining errors and the draft path.
- Exit code 2 means the command itself was wrong (message on stderr): fix the command, not the draft.

## 8. Report

On `accepted`, report the `candidate` path, the number of components and the mode from step 3 (in update mode also the number of components listed in `touchedComponents`), and tell the user that the Sustain viewer will offer to open the new diagram.
