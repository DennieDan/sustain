// VWR-02: ELK in the calling thread, for Node: the tests and the layout fixtures. Pages run it in
// workers instead (webview/layoutWorkers.ts).
import ELK from "elkjs/lib/elk.bundled.js";
import { runElk } from "./elk";
import type { RunElk } from "./scene";

const elk = new ELK();

export const runInThread: RunElk = (input, direction) => runElk(input, direction, elk);
