# Agent stream fixtures

`claude-generate.jsonl` and `codex-generate.jsonl` follow the documented output formats of
`claude -p --output-format stream-json --verbose` and `codex exec --json` (checked against the
official docs on 2026-10-18). They were written by hand, because no agent CLI was installed when
the parsers were built. Replace them with recorded runs at the first `[smoke]` run of UI-02.
