// CST-02: an estimated token range for a run from the repository's size (CST-01), and its price at
// API rates. `coefficients.json` is provisional until `npm run bench:fit` fits it from bench results;
// `pricing.json` holds each model's prices with the date and page they were read from.
import coefficients from "./coefficients.json";
import pricing from "./pricing.json";

export type EstimateAgent = "claude" | "codex";
export type EstimateKind = "full" | "refresh" | "ask";
export const ESTIMATE_AGENTS: readonly EstimateAgent[] = ["claude", "codex"];
export const ESTIMATE_KINDS: readonly EstimateKind[] = ["full", "refresh", "ask"];

/** Tokens ≈ base + perLine × non-test lines + perFile × files, between low × and high × that. */
export interface TokenLine {
  base: number;
  perLine: number;
  perFile: number;
  low: number;
  high: number;
}

/** The share of a run's tokens in each price class; the shares add up to 1. */
export interface TokenMix {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export interface Coefficients {
  basis: "provisional" | "fitted";
  fittedAt: string | null;
  /** Bench runs the fit used. */
  runs: number;
  lines: Record<EstimateAgent, Record<EstimateKind, TokenLine>>;
  mix: Record<EstimateAgent, TokenMix>;
}

/** USD per million tokens. */
export interface ModelPrice {
  id: string;
  label: string;
  agent: EstimateAgent;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  source: string;
}

export interface Pricing {
  asOf: string;
  unit: string;
  defaults: Record<EstimateAgent, string>;
  models: ModelPrice[];
}

/** What a size needs for an estimate: CST-01's non-test lines and files. */
export interface SizeFacts {
  nonTestLines: number;
  files: number;
}

export interface Estimate {
  low: number;
  high: number;
  basis: Coefficients["basis"];
}

export const COEFFICIENTS = coefficients as Coefficients;
export const PRICING = pricing as Pricing;

/** The token range of a `kind` run by `agent` on a repository of `size`. */
export function estimate(size: SizeFacts, agent: EstimateAgent, kind: EstimateKind, table: Coefficients = COEFFICIENTS): Estimate {
  const line = table.lines[agent][kind];
  const tokens = line.base + line.perLine * size.nonTestLines + line.perFile * size.files;
  return { low: Math.round(tokens * line.low), high: Math.round(tokens * line.high), basis: table.basis };
}

/** The model `id`, or the agent's default model. */
export function modelPrice(agent: EstimateAgent, id?: string, table: Pricing = PRICING): ModelPrice | undefined {
  return table.models.find((model) => model.id === (id ?? table.defaults[agent]) && model.agent === agent);
}

/** USD for `tokens` at `model`'s prices, split into price classes by `mix`. */
export function dollars(tokens: number, model: ModelPrice, mix: TokenMix): number {
  return (tokens / 1_000_000) * (mix.input * model.input + mix.cacheWrite * model.cacheWrite + mix.cacheRead * model.cacheRead + mix.output * model.output);
}

/** The USD range of `range` at `model`'s prices, with `agent`'s token mix. */
export function priceRange(range: Estimate, agent: EstimateAgent, model: ModelPrice, table: Coefficients = COEFFICIENTS): { low: number; high: number } {
  const mix = table.mix[agent];
  return { low: dollars(range.low, model, mix), high: dollars(range.high, model, mix) };
}
