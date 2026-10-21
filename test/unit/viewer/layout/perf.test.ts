// NFR-PERF-01 as changed by ENG-02: a 60-component, 120-connection layout with 2 levels of
// boundaries stays within a fixed multiple of a 12-component layout on the same machine.
import { expect, test } from "vitest";
import { comp, diagramOf, lay } from "./helpers";
import { BUDGET_FACTOR, checkLayoutBudget } from "./perfBudget";

/** `n` components in regions of 10 (each with 2 inner groups of 5) and `m` pseudo-random connections. */
function generated(n: number, m: number) {
  const ids = Array.from({ length: n }, (_, i) => `c${i}`);
  // Deterministic pseudo-random connections (LCG), no self-loops.
  let seed = 42;
  const next = (k: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % k;
  };
  const connections = Array.from({ length: m }, (_, i) => {
    const from = i % n;
    return { from: ids[from]!, to: ids[(from + 1 + next(n - 1)) % n]! };
  });
  const boundaries = Array.from({ length: Math.floor(n / 10) }, (_, r) => [
    { kind: "region", label: `region ${r}`, wraps: ids.slice(r * 10, r * 10 + 10) },
    { kind: "security-group", label: `group ${r}a`, wraps: ids.slice(r * 10 + 5, r * 10 + 5) },
    { kind: "security-group", label: `group ${r}b`, wraps: ids.slice(r * 10 + 5, r * 10 + 10) },
  ]).flat();
  return diagramOf({ components: ids.map((id) => comp(id, { sublabel: `service ${id}` })), connections, boundaries });
}

test("NFR-PERF-01 ENG-02 the 60/120 layout stays within the budget of a 12-component layout", { timeout: 60_000 }, async () => {
  const large = generated(60, 120);
  const small = generated(12, 24);
  expect(large.connections).toHaveLength(120);
  const scene = await lay(large);
  expect(scene.mode).toBe("auto");
  expect(scene.boundaries.every((b) => b.nested)).toBe(true);

  const result = await checkLayoutBudget(
    () => lay(large),
    () => lay(small),
  );
  expect(result.ok, `${result.subject.toFixed(0)} ms vs ${BUDGET_FACTOR} × ${result.reference.toFixed(0)} ms`).toBe(true);
});

test("ENG-02 the budget fails a large layout 10 times slower than usual", async () => {
  // A fake clock makes the small layout take 100 ms and the large one 7.4 times that, then 10 times more.
  let clock = 0;
  const now = () => clock;
  const advance = (ms: number) => async () => {
    clock += ms;
  };
  expect((await checkLayoutBudget(advance(740), advance(100), now)).ok).toBe(true);
  expect((await checkLayoutBudget(advance(7400), advance(100), now)).ok).toBe(false);
});
