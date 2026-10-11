---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Validator output contract and exit codes

## Context and Problem Statement

`validate.mjs` is read by a coding agent, not a person. FR-VAL-01 fixes the JSON shape and the three exit codes but leaves open how errors are categorised, how stdout is formatted, and which failures count as "usage or I/O" (exit 2) versus "rejected" (exit 1). An agent can only repair what it is told is its own mistake.

## Decision Drivers

* The agent must be able to fix every rejection by editing the draft alone.
* Exit 2 must mean "the invocation or the machine is wrong", so the agent stops instead of looping.
* Output must stay exactly one JSON object (FR-VAL-01).

## Considered Options

* Errors carry a category prefix in `message`; malformed JSON is a rejection; exit 2 only for arguments, paths and file-system failures
* Add a separate `code` field to each error object
* Treat malformed JSON as an I/O error (exit 2)

## Decision Outcome

Chosen option: "Errors carry a category prefix in `message`; malformed JSON is a rejection; exit 2 only for arguments, paths and file-system failures", because it keeps the FR-VAL-01 object shape exactly while telling the agent which rule failed, and every exit-1 case is fixable by rewriting the draft.

* stdout is one JSON object, pretty-printed with 2 spaces and a trailing newline. `errors` and `warnings` are always present; `candidate` only when accepted; `hint` only when rejected.
* Each error message starts with its category: `Json`, `Schema`, `DuplicateId`, `UnknownReference`, `MissingSources`, `BoundaryOverlap`, `InvalidCitationPath`, `DeniedCitation`, `BrokenCitation` (e.g. `BrokenCitation: Cited line 9 outside the file: src/api.ts has 2 lines`). Warnings use the fixed message `Removed app-owned field`.
* Schema messages are Ajv's, with the allowed values appended for `enum`, and `unknown field \`x\`` at the extra property's pointer for `additionalProperties`. Missing required properties are reported at the owning object (Ajv's instance location).
* Error order: schema errors in Ajv's order; otherwise semantic errors, then citation errors in document order. At most 50 are listed, then `{pointer: "", message: "N more errors not shown"}`.
* Exit 1 (rejected) includes a draft that is not valid JSON: `{pointer: "", message: "Json: draft.json is not valid JSON: …"}`.
* Exit 2, message on stderr prefixed `validate.mjs:`, nothing on stdout: wrong argument count; a path that is not `<R>/.archify/<run>/draft.json` or whose `<run>` does not match `architecture-<slug>-<YYYYMMDD-HHMMSS>[-N]` (the slug is needed for `meta.output`); an unreadable draft; a failed publish (temp write or rename).
* The process sets `process.exitCode` instead of calling `process.exit()`, because stdout to a pipe is asynchronous on macOS and could be truncated.

### Consequences

* Good, because the agent sees the failing rule without a schema change to the report.
* Good, because a syntax slip in the draft costs one repair, not a stopped run.
* Bad, because consumers that want the category must parse the message prefix.

### Confirmation

`test/unit/agent/validate.test.ts` runs the built `validate.mjs`: every exit path (accepted, rejected, five usage/I-O cases, publish failure), the 50-error cap, malformed JSON, and exact messages for semantic and citation errors.

## Pros and Cons of the Options

### Category prefix in `message`

* Good, because the FR-VAL-01 object keeps exactly its specified keys.
* Bad, because the category is embedded in text.

### Separate `code` field

* Good, because it is machine-readable.
* Bad, because it changes the output contract fixed by FR-VAL-01.

### Malformed JSON as exit 2

* Good, because nothing is validated without a document.
* Bad, because the agent would treat a fixable typo as a fatal error and stop.

## More Information

Smoke run under Node v18.20.8 (`npx -y node@18`) on 2026-10-11: `repo-facts.mjs` exit 0, `validate.mjs` exit 1 on a bad `type`, exit 0 after the fix, candidate published. Related: [ADR 0008](0008-validator-publishes-draft-as-candidate.md), [ADR 0009](0009-validator-owns-geometry-and-meta-fields.md), [ADR 0019](0019-validator-deviations-from-the-prototype-gate.md).
