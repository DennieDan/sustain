// VWR-02: ELK in the calling thread. The viewer and the tests both lay maps out this way.
import ELK from "elkjs/lib/elk.bundled.js";
import { runElk } from "./elk";
import type { RunElk } from "./scene";

const elk = new ELK();

export const runInThread: RunElk = (input, direction) => runElk(input, direction, elk);
