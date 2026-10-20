// CST-02: token estimates from the repository's size and prices from the official pages.
// CST-03: the estimate's text and the second click.
import { expect, test } from "vitest";
import { COEFFICIENTS, dollars, ESTIMATE_AGENTS, ESTIMATE_KINDS, estimate, estimateText, modelPrice, PRICING, priceRange, runEstimate, skillEstimates, tokenAmount, type Coefficients, type TokenMix } from "../../../src/model/estimate";

test("CST-02 estimates grow with size for every agent and kind, and stay provisional until fitted", () => {
  const sizes = [
    { nonTestLines: 2_000, files: 40 },
    { nonTestLines: 30_000, files: 400 },
    { nonTestLines: 300_000, files: 4_000 },
  ];
  for (const agent of ESTIMATE_AGENTS) {
    for (const kind of ESTIMATE_KINDS) {
      const ranges = sizes.map((size) => estimate(size, agent, kind));
      for (const range of ranges) expect(range.low).toBeLessThan(range.high);
      expect(ranges[1]!.low, `${agent} ${kind}`).toBeGreaterThan(ranges[0]!.low);
      expect(ranges[2]!.high, `${agent} ${kind}`).toBeGreaterThan(ranges[1]!.high);
      expect(ranges[0]!.basis).toBe("provisional");
    }
  }
  expect(COEFFICIENTS.basis).toBe("provisional");
});

test("CST-02 every price is dated and sourced from its provider's pricing page, and dollars follow the token mix", () => {
  expect(PRICING.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  for (const model of PRICING.models) {
    expect(model.source, model.id).toBe(model.agent === "claude" ? "https://platform.claude.com/docs/en/about-claude/pricing" : "https://developers.openai.com/api/docs/pricing");
  }
  for (const agent of ESTIMATE_AGENTS) expect(modelPrice(agent)?.id).toBe(PRICING.defaults[agent]);
  const opus = modelPrice("claude", "claude-opus-5-5")!;
  const mix: TokenMix = { input: 0.1, cacheWrite: 0.1, cacheRead: 0.7, output: 0.1 };
  expect(dollars(1_000_000, opus, mix)).toBeCloseTo(0.4 + 0.5 + 0.14 + 2, 10);
  const table: Coefficients = { ...COEFFICIENTS, mix: { ...COEFFICIENTS.mix, claude: mix } };
  const range = priceRange({ low: 200_000, high: 300_000, basis: "provisional" }, "claude", opus, table);
  expect([range.low, range.high].map((value) => Number(value.toFixed(3)))).toEqual([0.608, 0.912]);
  expect(modelPrice("codex", "claude-opus-5-5")).toBeUndefined();
});

test("CST-03 the estimate line gives the token range, the API price and what it means on a subscription", () => {
  const range = { low: 182_000, high: 257_000, basis: "provisional" as const };
  expect(estimateText(range, { low: 0.5, high: 0.8 })).toBe("About 180k–260k tokens (about $0.50–$0.80 at API prices; on a subscription it uses part of your plan's limit)");
  expect(estimateText(range, null)).toBe("About 180k–260k tokens (on a subscription it uses part of your plan's limit)");
  expect([tokenAmount(4_000), tokenAmount(995_000), tokenAmount(1_240_000), tokenAmount(2_000_000)]).toEqual(["10k", "1M", "1.2M", "2M"]);
  expect(estimateText({ ...range, low: 1_000 }, { low: 0.001, high: 0.004 })).toContain("about $0.01–$0.01 at API prices");
});

test("CST-03 a run needs a second click only when the top of its range is above the threshold", () => {
  const size = { nonTestLines: 10_000, files: 200 };
  const { range, text, model } = runEstimate(size, "claude", "full", Infinity);
  expect(model).toBe(PRICING.defaults.claude);
  expect(text).toBe(estimateText(range, priceRange(range, "claude", modelPrice("claude")!)));
  expect(runEstimate(size, "claude", "full", range.high).confirm).toBe(false);
  expect(runEstimate(size, "claude", "full", range.high - 1).confirm).toBe(true);
  expect(skillEstimates(size, "refresh").codex).toEqual({ ...estimate(size, "codex", "refresh"), text: runEstimate(size, "codex", "refresh", Infinity).text });
});
