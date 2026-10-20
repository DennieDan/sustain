# Bug taxonomy and difficulty tiers

What `session.mjs inject --kind` can plant, how subtle each kind is, and how to pick good
injection points. The engine applies a deterministic rewrite to the first code token on
the chosen line — never inside a string or comment — and records the pristine and buggy
lines in the manifest, so scoring and restore are always exact (ADR 0031/0038).

| kind | languages | tier | points | what the user is hunting | typical signature |
|------|-----------|------|--------|---------------------------|-------------------|
| `off-by-one` | JS/TS, Java | T1 | 10 | a bound that is one off | `i < n` → `i <= n`, `<=` → `<`, `>` → `>=` |
| `flipped-comparison` | JS/TS, Java | T1 | 10 | an inverted test | `===` → `!==`, `<=` → `>=`, `<` → `>`, `==` → `!=` |
| `missing-await` | JS/TS | T2 | 20 | a Promise used as a value | `await fetch(x)` → `fetch(x)` |
| `and-or-swap` | Java | T1 | 10 | a condition joined the wrong way | `a && b` → `a \|\| b`, `\|\|` → `&&` |
| `reference-equality` | Java | T2 | 20 | objects compared by reference | `a.equals(b)` → `a == b`, `!a.equals(b)` → `a != b` |

The file's extension decides its language: `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` and
`.cts` are JS/TS, and `.java` is Java. A kind outside the file's language is refused. In Java, generic
type arguments such as `List<Person>` are never mutated, and `reference-equality` needs a call such as
`name.equals(other.name)` whose argument has no top-level comma.

Tiers price subtlety (ADR 0035): T1 line-local slips a tired reader, T2 breaks control
flow across frames. T3 (cross-file, 30 points) needs multi-hunk mutations the v1 engine
cannot express — do not promise it.

## Choosing the injection point

- Seed inside the code you just wrote for the step — that is what the user watched happen
  and what `report --file` will be judged against.
- `--line` must hold a code token the kind's rule table matches, or inject fails with "no
  target". Aim a line earlier/later or switch kinds rather than retrying blindly.
- Prefer expressions whose mutation still parses and still *looks* plausible — a bound in
  a loop, a guard in an `if`, an `await` on a promise, an `equals` on two objects. The
  learning value is in a bug that survives a skim.
- `verify` checks that a Java file still compiles only through `--check-cmd`, such as
  `--check-cmd "./gradlew compileJava"` in a Gradle project.
- Vary kinds across steps; do not plant the same kind twice in a row unless the step's
  code offers nothing else.
- One `inject` per hunt. If a step legitimately warrants two bugs, inject, let the user
  find the first, then inject again while phase is still `hunting` — never announce the
  second until the first is found.

## What the user may be told

- The step title and the files the step touched — that is the announced surface.
- Nothing else without a `hint` call: L1 narrows the region ("in the loop that builds the
  result"), L2 names the kind, L3 is near-explicit. Each level costs score, so warn them.

## What you may never do

- Reveal file/line/kind/count beyond the step's file list.
- Edit or subagent during `hunting` (the hook denies it anyway).
- Hand-edit a bug in instead of `inject` — unrecorded bugs break `verify` and `restore`.
