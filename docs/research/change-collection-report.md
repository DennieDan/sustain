# Change collection research: report

- Status: for owner review at Gate 3, 2026-10-19
- Specification: [change-collection-spec.md](change-collection-spec.md)
- Evidence: [progress log](../../research/change-collection/progress.md), [run ledger](../../research/change-collection/results/ledger.jsonl), [metric tables](../../research/change-collection/results/metrics/), [frozen manifest](../../research/change-collection/frozen/manifest.json)
- Draft decision: [adr-draft-incremental-diagram-update.md](adr-draft-incremental-diagram-update.md)

## 1. Verdict on H1

**H1 is supported for identity stability, abstraction stability and hand corrections, and untested for error accumulation.**

Under the decision rule of spec §6.8, on the pooled Stage 2 data, **S4 (hybrid targeted patch) with change input CI-C beats the control S0** on all six criteria:

| Criterion | S4 × CI-C | S0 (control) | Verdict |
|---|---|---|---|
| C1 median ID retention M1 ≥ 0.9 | 1.00 [1.00, 1.00] | 0.50 [0.45, 0.60] | pass, indicative only (J2) |
| C2 per-pair M3 below S0 in ≥ 80 % of pairs, and same-commit M3 below the noise floor | 35 of 36 pairs; same-commit 0 vs 47 | – | pass, indicative only (J1, J2) |
| C3 M4 at most 5 pp worse than S0 | 0.00 [0.00, 0.33] | 0.00 [0.00, 0.00] | pass, indicative only (J1) |
| C4 correction survival M6 ≥ 0.8 | 0.994 (158 of 159) | – | pass |
| C5 stale-claim rate M7 at chain step 10 at most 5 pp above S0 | 0.00 | 0.00 | pass, indicative only (J3; uninformative) |
| C6 acceptance rate at most 5 pp below S0 | 0.998 | 1.000 | pass |
| Tie-break: median cost per run | $0.323 | $0.526 | S4 is 39 % cheaper |

Three findings qualify that verdict:

1. **Judges were too lenient to calibrate.** The role-check judge J2 and the claim-check judge J3 almost never answered `different-role` or `stale`, even for planted responsibility moves, so their recall on planted truth was 0. Every criterion that depends on them (C1, C2, C5) is indicative only. J1 reached precision 0.78, just under the 0.8 bar, so M3 and M4 on real pairs are indicative only too. M7 is 0 for both arms at every step, which says more about J3 than about the diagrams.
2. **The patch strategies miss some architectural changes.** Per repository, S4 fails C3 on tp (median 0.58 of labelled architectural changes missed with CI-C; S2 misses all of them) and on ip with CI-B/C (0.10). On planted pairs, where the truth is known, S2 and S4 missed **every boundary change** (3 of 3: classes moved into another package or layer), which S0 caught; S4 caught all 3 component changes and 2 of 3 responsibility moves.
3. **Patched diagrams grow over a chain.** Along 10-step chains the median component count of S4 rose from 16 to 18 (tp) and 15 to 19 (HyperTrack), while fresh S0 diagrams stayed at 14–15. This is not one of the spec's metrics; it is the visible form of accumulation that M7 could not measure.

## 2. What was run

| Stage | Pairs | Conditions | Agent runs accepted | Cost |
|---|---|---|---|---|
| Pilot and timing (R2) | 2 ip + 2 timing pairs | S0, S2 × CI-A | 16 | $7.64 |
| Stage 1 (R3) | 10 ip pairs | S0–S4 × CI-A × 3 | 150 (+30 derived S3) | $68.28 |
| Stage 2 (R4) | 39 pairs over ip, tp, HyperTrack | S0, S2, S4 × CI-A/B/C × 5 | 1,440 (incl. 195 base diagrams) | $617.72 |
| Corrections arm (R4) | 12 pairs with corrected bases | S2, S4 × CI-C × 5 | 120 | $35.17 |
| Chains (R5) | 3 windows × 10 steps | S4 × CI-C and S0, 5 chains | 315 | $137.35 |

Cost is Claude Code's `total_cost_usd` (the owner's subscription paid; the figure is the API-equivalent estimate). Every test agent ran as a separate `claude -p` process in a scratch clone whose history ended at the target commit, with the frozen skill from Sustain commit `74bf2a5` plus one change (connection `id` required). Judges, planters and correction writers were in-session subagents on the same model and never saw which strategy produced a diagram.

Pairs: real pairs at distance 1, 5 and 20 (ip), 1, 5 and 10 (HyperTrack) and single PR merges sampled small, medium and large (tp, team PRs only); one same-commit pair per repository; 18 planted pairs covering every change type, each committed with its true change list written first. The exact pairs are in [run-matrix.json](../../research/change-collection/results/run-matrix.json) and [pairs.json](../../research/change-collection/results/pairs.json).

## 3. Stage 1: screening on ip

Median over 10 pairs of the per-pair median over 3 repetitions; 95 % bootstrap intervals over pairs. Noise floor (S0 same-commit M3): 43.

| Strategy | M1 | M3 | M3 < S0 | Same-commit M3 | M4 | AR | Cost/run | C1 | C2 | C3 | C6 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S0 control | 0.50 [0.25, 0.67] | 13.5 [5.0, 28.5] | – | 43 | 0.00 | 1.00 | $0.390 | | | | |
| S1 hint | 1.00 [0.50, 1.00] | 0.5 [0.0, 1.0] | 8/9 | 0 | 0.00 [0.00, 0.20] | 1.00 | $0.478 | pass | pass | pass | pass |
| S2 patch | 1.00 [1.00, 1.00] | 0.0 [0.0, 1.0] | 8/9 | 0 | 0.00 [0.00, 0.25] | 1.00 | $0.461 | pass | pass | pass | pass |
| S3 post-hoc match | 0.73 [0.33, 0.92] | 9.5 [3.0, 20.0] | 7/9 | 28 | 0.00 | 1.00 | $0.390 | fail | fail | pass | pass |
| S4 hybrid | 1.00 [1.00, 1.00] | 0.5 [0.0, 1.0] | 8/9 | 0 | 0.00 [0.00, 0.25] | 1.00 | $0.464 | pass | pass | pass | pass |

RQ2: the deterministic matcher S3 restores some identity (M1 0.73) but not abstraction: a regenerated diagram re-cuts components, so even matched IDs carry new labels and sublabels, and same-commit M3 stays at 28. The owner advanced S2 and S4 (the two cheapest passing strategies) at Gate 2.

## 4. Stage 2: three repositories

### 4.1 Pooled (39 pairs, 5 repetitions)

| Cell | M1 | M2 matched | M3 | M3 < S0 | Same-commit M3 | M4 | AR | Cost/run |
|---|---|---|---|---|---|---|---|---|
| S0 | 0.50 [0.45, 0.60] | 0.82 | 44.0 [29, 47] | – | 47 | 0.00 [0.00, 0.00] | 1.000 | $0.526 |
| S2 × A | 1.00 | 1.00 | 0.0 | 35/36 | 0 | 0.10 [0.00, 0.89] | 1.000 | $0.321 |
| S2 × B | 1.00 | 1.00 | 0.0 | 35/36 | 0 | 0.09 [0.00, 0.67] | 1.000 | $0.314 |
| S2 × C | 1.00 | 1.00 | 0.0 | 35/36 | 0 | 0.07 [0.00, 0.89] | 1.000 | $0.323 |
| S4 × A | 1.00 | 1.00 | 0.0 [0, 1] | 35/36 | 0 | 0.00 [0.00, 0.20] | 0.998 | $0.323 |
| S4 × B | 1.00 | 1.00 | 0.0 [0, 1] | 35/36 | 0 | 0.00 [0.00, 0.35] | 0.998 | $0.323 |
| S4 × C | 1.00 | 1.00 | 0.0 [0, 1] | 35/36 | 0 | 0.00 [0.00, 0.33] | 0.998 | $0.323 |

S2 fails C3 in every input (M4 0.07–0.10). S4 passes C1, C2, C3 and C6 in every input; the cost tie-break picks CI-C by $0.0002. RQ3: the change input barely matters for S4 on pooled data (M4 medians all 0, costs within a tenth of a cent); per repository CI-A is best on ip (M4 0.00 against 0.10) and CI-B best on tp (0.41 against 0.58 and 0.70).

### 4.2 Per repository

| Repo | Noise floor (S0 same-commit M3, 5 runs) | S0 M1 / M3 / M4 | S2 × C M1 / M3 / M4 | S4 × A | S4 × B | S4 × C | S4 × C verdict |
|---|---|---|---|---|---|---|---|
| ip | 43 (34, 47, 43, 39, 56) | 0.50 / 16 / 0.00 | 1.00 / 0 / 0.10 | 1.00 / 0 / 0.00 | 1.00 / 0 / 0.10 | 1.00 / 0 / 0.10 | fails C3 |
| tp | 44 (56, 36, 46, 44, 42) | 0.54 / 49 / 0.00 | 1.00 / 0 / 1.00 | 1.00 / 0 / 0.70 | 1.00 / 0 / 0.41 | 1.00 / 0 / 0.58 | fails C3 |
| HyperTrack | 73 (73, 69, 73, 80, 78) | 0.45 / 47 / 0.00 | 1.00 / 0 / 0.00 | 1.00 / 0 / 0.00 | 1.00 / 0 / 0.00 | 1.00 / 0 / 0.00 | passes all |

Full tables with intervals: `results/metrics/s2-{pooled,cs2103-ip,cs2103-tp,HyperTrack}-table.md`.

### 4.3 Planted pairs (known truth)

M4 per planted pair, S4 × CI-C (S0 in brackets); 0 = the change appears in the diff, 1 = missed:

| Type | ip | tp | HyperTrack |
|---|---|---|---|
| component | 0 [0] rename | 0 [0] removal | 0 [0] split |
| responsibility | 0 [0] | 1 [0] | 0 [0] |
| connection | 1 [1] | 0 [0] | 0 [0] |
| boundary | 1 [0] | 1 [0] | 1 [0] |

Spurious diff entries on the negative controls (evidence-only and not-architectural plants): S2 and S4 0 on all six; S0 36–73. The ip connection plant (the exit command now saves) is missed by every strategy: commands were already drawn as connected to storage.

### 4.4 Cost (M5, Stage 2 medians per run)

| Cell | Cost | Output tokens | Cache read | Cache write | Wall | Tool calls | Validator runs |
|---|---|---|---|---|---|---|---|
| S0 | $0.501 | 6,938 | 249,412 | 37,709 | 68 s | 13 | 1 |
| S2 × C | $0.323 | 5,918 | 88,403 | 23,276 | 49 s | 8 | 2 |
| S4 × C | $0.322 | 5,910 | 91,575 | 23,173 | 49 s | 9 | 2 |

Incremental runs read about a third as much context and finish 28 % faster; they need one more validator round on median (citations of patched components are re-checked).

## 5. Corrections arm (RQ4)

12 pairs (the 4 per repository with the most untouched base components), 5 repetitions, 159 hand corrections written by correction-writer subagents and checked against the code (79 sublabels, 71 connection labels, 9 merges).

| Strategy | Corrections kept | M6 | Median per repository | C4 |
|---|---|---|---|---|
| S2 × C | 158 / 159 | 0.994 | 1.00 / 1.00 / 1.00 | pass |
| S4 × C | 158 / 159 | 0.994 | 1.00 / 1.00 / 1.00 | pass |

The one lost correction is the same in both: a sublabel "… Exit no-op" became "… Exit saves" because the plant made the exit command save; the update was right and the correction had become false.

## 6. Chains (RQ5)

5 chains per repository over 10 consecutive steps; step 0 is a fresh S0 diagram shared by both arms.

| Repo | S4 × C spurious M3 per step (median) | S0 M3 per step | M7 step 5 / 10, S4 | M7 step 5 / 10, S0 | Components step 1 → 10, S4 | S0 |
|---|---|---|---|---|---|---|
| ip | 0 (0–2) | 36.5 (12–45) | 0 / 0 | 0 / 0 | 9 → 11 | 10 → 11 |
| tp | 0 (0–3) | 49 (25–56) | 0 / 0 | 0 / 0 | 16 → 18 | 14 → 14 |
| HyperTrack | 2 (1–3) | 40 (28–58) | 0 / 0 | 0 / 0 | 15 → 19 | 14 → 15 |

C5 passes (0 against 0) but is uninformative: J3 marked all 840 components of steps 5 and 10 `supported`, in both arms. Acceptance in chains: S4 150/150, S0 165/166 (one timeout).

## 7. Judge calibration

| Judge | Planted items | Precision | Recall | Consequence |
|---|---|---|---|---|
| J1 change labels | 18 plants | 0.78 | 0.93 | C2 and C3 on real pairs indicative only |
| J2 role check | 195 (Stage 1 63, Stage 2 132) | 0.00 (4 false positives, no true positive) | 0.00 | C1 and C2 indicative only |
| J3 claim check | 30 (Stage 1 6, Stage 2 24) | 1.00 (2 true positives) | 0.13 (2 of 15) | C5 indicative only |

Calibration items were restricted to the components whose cited lines the plant changed; the broad set (every component citing a planted file) gave lower recall still. The judges read a moved minor duty (CSV parsing, export formatting, address validation) as "same unit, still does its job". Whether that is a judge defect or a too-strict calibration truth is itself a finding: the planted responsibility moves were small.

## 8. Integrity of the runs

- **Isolation.** Canary passed at R0 and at the start of every stage (5 passing canaries; the first R0 canary under the spec's verbatim settings hung, which led to D1 and D2). Contaminated attempts recorded: 40 (Stage 1 5, Stage 2 31, corrections 1, chains 3), all discarded and re-run. A revised audit found 20 of them to be false positives (shell working directory not tracked across calls; Telegram command strings read as paths; a refused command's `cd` counted as run); `results/audit/*-reaudit.json` lists them. The genuine ones were agents naming the run folder above the clone (`../../../../../../build.gradle`) or writing scratch files to `$TMPDIR`; none read outside information.
- **Timeouts and failures.** Agent outcomes: 1 timeout (chain), 1 failure (validator limit exceeded). Infrastructure, excluded from AR and attempt counts: 2,047 attempts that hit the subscription session limit (twice: 2,016 in Stage 2, 31 in the chains) and 20 that froze while the Mac slept ([infra-errors.json](../../research/change-collection/results/audit/infra-errors.json)).
- **Template risk.** Citation share under `docs/` was 0 in every Stage 2 cell: the agents never cited the AB3 Developer Guide or the Duke docs. Results are reported per repository; HyperTrack (no template) agrees with the pooled verdict and is the repository where S4 passes everything.

## 9. Deviations

| ID | What changed | Approval |
|---|---|---|
| D1 | `claude -p --bare` replaced by `--safe-mode --setting-sources "" --strict-mcp-config` (bare mode needs an API key; the machine has OAuth only) | Owner, 2026-10-17 |
| D2 | `permissions.blockReadsOutsideWorkingDirectories` replaced by explicit read denials (`Read`/`Edit` on `/Users/**`, `/Volumes/**`; sandbox `denyRead` with `allowRead` for the own run folder), because the original setting hangs Claude Code 2.1.284 when combined with the sandbox | Owner, 2026-10-17 |
| – | M2 split/merge rule kept although shared citations inflate it; footnoted (split/merge medians are 4/4 in every cell, S0 included) | Owner, Gate 1 |
| – | S3 repetition *i* derived from S0 repetition *i* instead of a separate agent run | Owner, Gate 1 |
| – | Stage 1 ip keys reused in Stage 2 (same manifest, same pairs) | Implementation, logged at Gate 2 |
| – | Frozen correction-writer prompt names a validation folder the validator rejects; writers validated in a correctly named folder | Known defect, logged |
| – | Rate-limited and sleep-frozen attempts classified as infrastructure and excluded from AR | Implementation, logged |

No frozen artifact changed after Gate 1 (`node harness/manifest.mjs check` printed "manifest matches" before every batch).

## 10. Recommendation

1. **Adopt incremental update in the S4 form** for the next Sustain milestone: a deterministic script maps the diff to the components whose cited files it touches, and the agent re-explores only those components and the uncited changed files, then patches the previous diagram. It removes the identity noise the spec set out to fix (same-commit spurious diff 47 → 0, ID retention 0.50 → 1.00), keeps hand corrections (0.994), and costs 39 % less per run.
2. **Pair it with a periodic fresh regeneration**, because the patch strategies miss changes that do not touch cited files (every planted boundary move) and grow the diagram over a chain. A full S0 run every N updates, or when the uncited-files list is large, bounds both.
3. **Do not rely on the J2/J3 judges** for future evaluation; they need either stronger prompts or a different calibration design before they can measure role drift or staleness.

This reverses the product spec's non-goal "A `sustain-architecture-refresh` skill. Re-run the skill instead." The draft ADR proposes the change for owner approval under the product spec's §10.

## 11. Out of bounds and future work

Out of bounds (not tested, outside Sustain's architecture): an LLM call or embeddings inside the extension to match components; a code-graph service; network-backed change summaries.

Future work:

- **S5 periodic refresh**: S4 with a scheduled S0 regeneration whose IDs are then matched to the patched diagram by S3, measured on the same chains.
- **S6 boundary-aware mapping**: extend the S4 mapper to flag package or directory moves of cited files, the change type every patch strategy missed.
- A judge redesign for J2/J3 (pairwise comparison against the planted diff instead of single-sided verdicts), and larger planted responsibility moves for calibration.
- Cost scaling with repository size (spec non-goal for this study).
