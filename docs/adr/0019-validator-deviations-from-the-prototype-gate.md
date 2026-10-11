---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Validator deviations from the prototype's submission gate

## Context and Problem Statement

FR-VAL-* is a port of the prototype's Submission profile (`archalign-model/src/{submission,checks,citations}.rs`, `archalign-agent/src/gate.rs`, `archalign-repo/src/{deny,text}.rs`). The spec changes some behaviour explicitly, and the port has to settle a few points where the prototype relied on Rust machinery that does not exist here. The porting rule (spec §9) requires every deliberate difference to be recorded.

## Considered Options

* Port the prototype's behaviour exactly, ignoring the spec's changes
* Follow the spec where it differs, and drop prototype steps that the TypeScript model makes redundant

## Decision Outcome

Chosen option: "Follow the spec where it differs, and drop prototype steps that the TypeScript model makes redundant", because the spec is the contract and redundant steps would only duplicate errors.

Differences from the prototype:

| # | Prototype | Sustain | Reason |
|---|---|---|---|
| 1 | Semantic errors stop before citation checks | Semantic and citation checks both run once the schema passes | FR-VAL-06 only stops on schema errors; the agent gets all fixable errors in one round |
| 2 | A symlink resolving outside the root is `InvalidCitationPath` | `BrokenCitation` ("resolves outside the repository root") | FR-VAL-05 lists outside-root resolution under `BrokenCitation` |
| 3 | `end_line` without `line` only checked against the line count | `end_line` requires `line` | FR-VAL-05 |
| 4 | Cited files with uncommitted changes get a `ModifiedCitation` warning | No such warning | FR-VAL-05 defines no warnings; dirty paths reach the agent through `repo-facts.mjs` (FR-RF-01) |
| 5 | No path length rule in the syntax check | At most 240 characters | FR-VAL-05 (also the schema's `maxLength`) |
| 6 | Strict serde parse (`deny_unknown_fields`) after the schema | No separate parse step | the vendored schema's `additionalProperties: false` already rejects unknown fields; TypeScript types add no runtime check |
| 7 | Semantic error for more than 3 sources | Not a semantic rule | the schema's `maxItems: 3` rejects it first, so the rule could never fire |
| 8 | All dirty paths | At most 200 plus `dirtyCount` | FR-GIT-01 |
| 9 | Messages for range errors say "outside {path} (N lines)" | Every line-range message names the file's line count, `end_line` errors included | FR-VAL-05 requires the count in the message |

### Consequences

* Good, because agents see every semantic and citation problem of a schema-valid draft at once, saving repair rounds.
* Good, because the error categories and messages match the spec's wording.
* Bad, because the prototype's tests for rules 1–4 and 7 could not be ported as-is; their Sustain counterparts assert the new behaviour.

### Confirmation

`test/unit/agent/validate.test.ts` › `semantic and citation errors are reported together` (1), `a symlink pointing outside the root is a broken citation` (2); `test/unit/model/citations.test.ts` range cases (3, 9) and path-syntax cases (5); `test/unit/model/git.test.ts` › `dirty paths are capped at 200 with the total count kept` (8).
