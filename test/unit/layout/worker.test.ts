// VWR-02: ELK's worker code, run the way a Web Worker runs it and reached through ELK's API as the
// viewer reaches it, lays out every fixture exactly as bundled ELK does in the thread.
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { expect, test } from "vitest";
import { layoutWorkerDefine } from "../../../esbuild.mjs";
import { runInThread } from "../../../src/layout/elkInThread";
import { layoutDiagram } from "../../../src/layout/layout";
import { readDiagram, type ViewDiagram } from "../../../src/model/tolerant";
import { workerRunner } from "../../../webview/layoutWorkers";
import { archifyFixtures } from "../support/fixtures";
import { fixedAdvance, VIEWPORT } from "./helpers";

/**
 * A stand-in for `Worker` that runs `source` in a sandbox whose global scope is a worker's. Messages
 * cross as JSON parsed on the receiving side, so each side gets objects of its own realm, as a
 * structured clone gives a real worker.
 */
function sandboxWorker(source: string): Worker {
  const worker = { onmessage: null as ((event: { data: unknown }) => void) | null, postMessage: (data: unknown) => receive(JSON.stringify(data)), terminate: () => undefined };
  const context = createContext({ reply: (json: string) => queueMicrotask(() => worker.onmessage?.({ data: JSON.parse(json) })), setTimeout, clearTimeout, console });
  // A worker's global scope is also `self`, posts with `postMessage`, and has no `document`.
  runInContext("globalThis.self = globalThis; globalThis.postMessage = (data) => reply(JSON.stringify(data));", context);
  runInContext(source, context);
  const receive = runInContext("(json) => globalThis.onmessage({ data: JSON.parse(json) })", context) as (json: string) => void;
  return worker as unknown as Worker;
}

/** Every fixture with its positions removed, so ELK lays it out. */
const diagrams: [string, ViewDiagram][] = archifyFixtures().map((fixture) => {
  const result = readDiagram(JSON.parse(fixture.text));
  if (!result.ok) throw new Error(`${fixture.name}: ${result.reason}`);
  return [fixture.name, { ...result.diagram, components: result.diagram.components.map(({ pos: _pos, row: _row, col: _col, ...rest }) => rest) }];
});

test("VWR-02 ELK's embedded worker code lays out every fixture exactly as ELK does in the thread", { timeout: 120_000 }, async () => {
  const source = JSON.parse((await layoutWorkerDefine())["__SUSTAIN_LAYOUT_WORKER__"]!) as string;
  expect(source).toBe(readFileSync(require.resolve("elkjs/lib/elk-worker.min.js"), "utf8"));
  const started: string[] = [];
  const run = workerRunner(source, (url) => {
    started.push(url);
    return sandboxWorker(source);
  });
  for (const [name, diagram] of diagrams) {
    const viaWorkers = await layoutDiagram(diagram, { measure: fixedAdvance, viewport: VIEWPORT, run });
    const inThread = await layoutDiagram(diagram, { measure: fixedAdvance, viewport: VIEWPORT, run: runInThread });
    expect(viaWorkers, name).toEqual(inThread);
  }
  expect(started).toHaveLength(2);
});
