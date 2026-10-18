// CST-06: what a series of bench runs will cost, before any starts. `npm run bench:plan` prints it,
// and `npm run bench` refuses to start a series whose top estimate passes the cap.
import { estimate, modelPrice, priceRange, type EstimateAgent, type EstimateKind, type SizeFacts } from "../../src/model/estimate";
import type { BenchKind } from "../../src/model/fit";
import type { Tier } from "../../src/model/repoSize";

/** The size assumed for a tier until its clone is measured: the top of the tier. */
export const TIER_SIZE: Record<Tier, SizeFacts> = {
  S: { nonTestLines: 20_000, files: 400 },
  M: { nonTestLines: 150_000, files: 3_000 },
  L: { nonTestLines: 400_000, files: 8_000 },
};
/** USD a series may reach without `--cap`. */
export const DEFAULT_CAP_USD = 20;

/** The estimate kind a bench kind spends; a baseline asks like Ask, without the map. */
const SPENDS: Record<BenchKind, EstimateKind> = { full: "full", refresh: "refresh", audit: "refresh", baseline: "ask", assisted: "ask" };

export interface SeriesPlan {
  runs: number;
  tokens: { low: number; high: number };
  usd: { low: number; high: number };
  model: string | null;
  cap: number;
  ok: boolean;
}

/** The cost of `runs` runs of `kind` by `agent` on a repository of `size`, against `cap` USD. */
export function planSeries(agent: EstimateAgent, kind: BenchKind, runs: number, size: SizeFacts, cap: number, questions = 1): SeriesPlan {
  const one = estimate(size, agent, SPENDS[kind]);
  const times = runs * (kind === "baseline" || kind === "assisted" ? questions : 1);
  const tokens = { low: one.low * times, high: one.high * times };
  const model = modelPrice(agent);
  const price = model ? priceRange({ ...tokens, basis: one.basis }, agent, model) : { low: 0, high: Infinity };
  return { runs, tokens, usd: price, model: model?.id ?? null, cap, ok: price.high <= cap };
}

export function planText(plan: SeriesPlan): string {
  const usd = (value: number): string => `$${value.toFixed(2)}`;
  const verdict = plan.ok ? `within the ${usd(plan.cap)} cap` : `above the ${usd(plan.cap)} cap; raise --cap to run it`;
  return `${plan.runs} run${plan.runs === 1 ? "" : "s"}: about ${plan.tokens.low.toLocaleString("en-US")}–${plan.tokens.high.toLocaleString("en-US")} tokens, ${usd(plan.usd.low)}–${usd(plan.usd.high)} at ${plan.model ?? "unknown"} prices, ${verdict}.\n`;
}
