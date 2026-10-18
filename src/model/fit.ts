// CST-02: fits the estimate's coefficients from bench results (CST-06). Each agent and kind with
// enough accepted runs gets a least-squares line over non-test lines and files, a band from the
// runs' spread around it, and each agent a token mix from the runs' usage.
import type { Coefficients, EstimateAgent, EstimateKind, SizeFacts, TokenLine, TokenMix } from "./estimate";
import { ESTIMATE_AGENTS, ESTIMATE_KINDS } from "./estimate";

/** The bench's run kinds (CST-06). */
export type BenchKind = "full" | "refresh" | "audit" | "baseline" | "assisted";

/** `bench/results/<run>/result.json`, as far as the fit reads it. */
export interface BenchResult {
  agent: EstimateAgent;
  kind: BenchKind;
  accepted: boolean;
  size: SizeFacts;
  usage: TokenMix;
}

/** The estimate kind each bench kind measures; `audit` and `baseline` measure none. */
const ESTIMATES: Partial<Record<BenchKind, EstimateKind>> = { full: "full", refresh: "refresh", assisted: "ask" };
/** Fewest runs per agent and kind for a fit. */
export const MIN_RUNS = 4;

const total = (usage: TokenMix): number => usage.input + usage.cacheWrite + usage.cacheRead + usage.output;

/** Least squares for `y ≈ X·b`, or `null` when the columns are not independent. */
function leastSquares(rows: number[][], y: number[]): number[] | null {
  const n = rows[0]!.length;
  const a = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => rows.reduce((sum, row) => sum + row[i]! * row[j]!, 0)), rows.reduce((sum, row, k) => sum + row[i]! * y[k]!, 0)]);
  for (let col = 0; col < n; col++) {
    const pivot = a.slice(col).reduce((best, row, k) => (Math.abs(row[col]!) > Math.abs(a[best]![col]!) ? col + k : best), col);
    if (Math.abs(a[pivot]![col]!) < 1e-9 * Math.max(1, Math.abs(a[col]![col]!))) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row]![col]! / a[col]![col]!;
      for (let k = col; k <= n; k++) a[row]![k]! -= factor * a[col]![k]!;
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

/**
 * The line through `runs`: base, perLine and perFile by least squares, dropping a predictor whose
 * slope comes out negative so estimates keep growing with size. `null` when the runs cannot fix one.
 */
export function fitLine(runs: { size: SizeFacts; tokens: number }[]): TokenLine | null {
  if (runs.length < MIN_RUNS) return null;
  const predictors = [(size: SizeFacts) => size.nonTestLines, (size: SizeFacts) => size.files];
  for (const used of [[0, 1], [0], [1], []]) {
    const solved = leastSquares(runs.map((run) => [1, ...used.map((p) => predictors[p]!(run.size))]), runs.map((run) => run.tokens));
    if (solved === null || solved.slice(1).some((slope) => slope < 0) || solved[0]! < 0) continue;
    const line = { base: solved[0]!, perLine: used.includes(0) ? solved[1 + used.indexOf(0)]! : 0, perFile: used.includes(1) ? solved[1 + used.indexOf(1)]! : 0 };
    const ratios = runs.map((run) => run.tokens / (line.base + line.perLine * run.size.nonTestLines + line.perFile * run.size.files));
    const round = (value: number, places: number): number => Number(value.toFixed(places));
    return {
      base: Math.round(line.base),
      perLine: round(line.perLine, 4),
      perFile: round(line.perFile, 4),
      low: round(Math.min(...ratios), 2),
      high: round(Math.max(...ratios), 2),
    };
  }
  return null;
}

/** The share of all `usages`' tokens in each price class. */
export function fitMix(usages: TokenMix[]): TokenMix | null {
  const sum = usages.reduce((acc, usage) => ({ input: acc.input + usage.input, cacheWrite: acc.cacheWrite + usage.cacheWrite, cacheRead: acc.cacheRead + usage.cacheRead, output: acc.output + usage.output }), { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
  const all = total(sum);
  if (all === 0) return null;
  const share = (value: number): number => Number((value / all).toFixed(4));
  return { input: share(sum.input), cacheWrite: share(sum.cacheWrite), cacheRead: share(sum.cacheRead), output: share(sum.output) };
}

/** New coefficients from `results`, keeping `previous` where too few runs exist. */
export function fitCoefficients(results: readonly BenchResult[], previous: Coefficients, now: Date): { coefficients: Coefficients; fitted: string[]; kept: string[] } {
  const next: Coefficients = structuredClone(previous);
  const fitted: string[] = [];
  const kept: string[] = [];
  let used = 0;
  for (const agent of ESTIMATE_AGENTS) {
    for (const kind of ESTIMATE_KINDS) {
      const runs = results.filter((result) => result.agent === agent && ESTIMATES[result.kind] === kind && (kind === "ask" || result.accepted));
      const line = fitLine(runs.map((run) => ({ size: run.size, tokens: total(run.usage) })));
      if (line === null) {
        kept.push(`${agent} ${kind}`);
        continue;
      }
      next.lines[agent][kind] = line;
      fitted.push(`${agent} ${kind}`);
      used += runs.length;
    }
    const mix = fitMix(results.filter((result) => result.agent === agent && ESTIMATES[result.kind] !== undefined).map((result) => result.usage));
    if (mix !== null) next.mix[agent] = mix;
  }
  if (fitted.length > 0) Object.assign(next, { basis: "fitted", fittedAt: now.toISOString(), runs: used });
  return { coefficients: next, fitted, kept };
}
