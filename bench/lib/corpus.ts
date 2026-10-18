// CST-06: bench/corpus.json, the repositories the bench runs agents on.
import { readFileSync } from "node:fs";
import type { Tier } from "../../src/model/repoSize";

export interface CorpusEntry {
  id: string;
  /** A git URL, or "." for this repository; absent for a fixture. */
  url?: string;
  /** A folder of this repository that becomes a fresh repository for each run. */
  fixture?: string;
  /** The pinned commit a run starts from. */
  commit?: string;
  /** The later commit a refresh run moves to. */
  changeTo?: string;
  tier: Tier;
  language: string;
  /** Globs removed before every run, such as documentation that describes the architecture. */
  strip: string[];
  /** What `baseline` and `assisted` runs ask. */
  questions: string[];
  /** Kept out of tuning. */
  heldOut?: boolean;
}

export function readCorpus(file: string): CorpusEntry[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { entries: CorpusEntry[] };
  return parsed.entries;
}
