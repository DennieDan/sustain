// VWR-02: ELK through two Web Workers started from a Blob URL, one per direction, so RIGHT and DOWN
// lay out in parallel off the page's thread. The page keeps ELK's small API; the workers run ELK's
// worker code, which the build embeds as __SUSTAIN_LAYOUT_WORKER__. The CSP allows exactly
// `worker-src blob:` for them.
import ELK from "elkjs/lib/elk-api.js";
import { runElk, type Direction, type ElkEngine } from "../src/layout/elk";
import type { RunElk } from "../src/layout/scene";

declare const __SUSTAIN_LAYOUT_WORKER__: string | undefined;

/** A layout runner whose engines start workers from `source`, one per direction. */
export function workerRunner(source: string | undefined = typeof __SUSTAIN_LAYOUT_WORKER__ === "string" ? __SUSTAIN_LAYOUT_WORKER__ : undefined, makeWorker: (url: string) => Worker = (url) => new Worker(url)): RunElk {
  let url: string | null = null;
  const engines = new Map<Direction, ElkEngine>();
  const engineFor = (direction: Direction): ElkEngine => {
    const existing = engines.get(direction);
    if (existing) return existing;
    if (source === undefined) throw new Error("the layout worker was not built into this page");
    url ??= URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const blob = url;
    const engine = new ELK({ workerUrl: blob, workerFactory: () => makeWorker(blob) });
    engines.set(direction, engine);
    return engine;
  };
  return (input, direction) => runElk(input, direction, engineFor(direction));
}
