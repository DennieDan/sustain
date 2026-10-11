// NFR-PERF-01: 60 components, 120 connections, 2 levels of boundaries in under 1 s (median of 5).
import { expect, test } from "vitest";
import { comp, diagramOf, lay } from "./helpers";

test("NFR-PERF-01 layout of 60 components and 120 connections takes < 1 s (median of 5)", async () => {
  const ids = Array.from({ length: 60 }, (_, i) => `c${i}`);
  // Deterministic pseudo-random connections (LCG), no self-loops.
  let seed = 42;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const connections = Array.from({ length: 120 }, (_, i) => {
    const from = i % 60;
    return { from: ids[from]!, to: ids[(from + 1 + next(59)) % 60]! };
  });
  // 6 outer regions of 10 components, each with 2 inner groups of 5.
  const boundaries = Array.from({ length: 6 }, (_, r) => [
    { kind: "region", label: `region ${r}`, wraps: ids.slice(r * 10, r * 10 + 10) },
    { kind: "security-group", label: `group ${r}a`, wraps: ids.slice(r * 10, r * 10 + 5) },
    { kind: "security-group", label: `group ${r}b`, wraps: ids.slice(r * 10 + 5, r * 10 + 10) },
  ]).flat();
  const diagram = diagramOf({ components: ids.map((id) => comp(id, { sublabel: `service ${id}` })), connections, boundaries });
  expect(diagram.connections).toHaveLength(120);

  const times: number[] = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    const scene = await lay(diagram);
    times.push(performance.now() - start);
    expect(scene.mode).toBe("auto");
    expect(scene.boundaries.every((b) => b.nested)).toBe(true);
  }
  times.sort((a, b) => a - b);
  expect(times[2]).toBeLessThan(1000);
});
