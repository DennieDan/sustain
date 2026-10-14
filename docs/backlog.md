- Apart from the features that you kept, add `node finder` and `history browser`

## Learning modes (ADRs 0029–0036)

- `session.mjs` state machine: all commands **shipped** — `init`, `plan`, `inject`, `status`, `report`, `hint`, `verify`, `complete`, `pause`, `resume`, `restore`, `abandon` (ADRs 0037/0039 record the contract)
- `session-hook.mjs` Devin hook **shipped** + hand-written `.devin/hooks.v1.json`; extension merge-safe install remains
- `.sustain/<mode>-<slug>-<ts>[-N]/` run folders: `session.json` (public), `events.jsonl` (ledger), `manifest.json` (secrets) + `.sustain/active` lock; `.sustain/` appended to `.gitignore` by the extension (Phase 3)
- Mutation engine + bug-kind taxonomy reference (v1: JS/TS line-local kinds; per-step cap ~1–2, trivial steps merged in `plan`)
- Difficulty tiers from the taxonomy (T1 line-local, T2 control-flow/async, T3 cross-file) — the rules for how each level is differentiated will be expanded in a later design pass
- `sustain-bugfix` skill **shipped** (`triggers: user`); next `sustain-guided` (per-step check commands declared in `plan`)
- Buddy Tour mode: deferred — do not design yet. Open question when picked up: are checkpoints extension-observed (editor events → progress file) or script-verified conditions?
- Extension: merge-safe `.devin/hooks.v1.json` install/update/remove, Devin terminal launcher, `.sustain/` watcher, session webview (phase, k/n, timer — never `manifest.json`) + local leaderboard
- ~~`restore`/`abandon` safety net, clean-git warning at `init`, stale-session auto-release~~ **shipped** (ADR 0039)
- Remote/shared leaderboard — deferred: breaks the no-network rule (NFR-SEC-02), needs its own ADR; revisit manifest secrecy then
- Claude-target hook install (`.claude/settings.json`, tool-name normalisation) if Claude sessions are kept for hunt mode; Codex hunt mode is honor-system for edits
