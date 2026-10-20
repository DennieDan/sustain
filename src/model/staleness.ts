// FRS-02: how each citation of a map compares with the code now. A citation is fresh when its
// lines still hash the same at the same place, moved when the block is found elsewhere (or in
// the file a rename leads to), edited when the file exists without it, and missing when the
// file is gone. Without fingerprints every citation is unknown.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FINGERPRINTS_FILE, gitBlobId, hashLines, looseLines, normalizedLines, type CitationPrint, type Fingerprints } from "./fingerprints";
import { isJsonObject } from "./types";

export type Freshness = "fresh" | "moved" | "edited" | "missing" | "unknown";

/** Worse states sort later; a box takes its worst citation. */
const ORDER: readonly Freshness[] = ["fresh", "unknown", "moved", "edited", "missing"];

export interface CitationState {
  component: string;
  index: number;
  path: string;
  state: Freshness;
  /** Where a moved citation's block is now. */
  now?: { path: string; line?: number; end_line?: number };
}

export interface MapFreshness {
  /** `null` when the map has no fingerprints. */
  revision: string | null;
  createdAt: string | null;
  citations: CitationState[];
  /** Each citing box's worst citation. */
  boxes: Record<string, Freshness>;
}

/** The run folder's fingerprints, or `null` when there are none or they are unreadable. */
export function readFingerprints(runDir: string): Fingerprints | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(runDir, FINGERPRINTS_FILE), "utf8"));
    return isJsonObject(value) && value["schema"] === 1 && Array.isArray(value["citations"]) ? (value as unknown as Fingerprints) : null;
  } catch {
    return null;
  }
}

/** The start of the window of `size` lines whose hash is `hash`, nearest `near`, or `null`. */
function findBlock(lines: readonly string[], size: number, hash: string, near: number): number | null {
  let best: number | null = null;
  for (let start = 0; start + size <= lines.length; start++) {
    if (hashLines(lines.slice(start, start + size)) !== hash) continue;
    if (best === null || Math.abs(start - near) < Math.abs(best - near)) best = start;
  }
  return best;
}

/** Where `print`'s block is in `bytes`: at its own lines, elsewhere, or nowhere. */
function locate(print: CitationPrint, bytes: Buffer): { at: "same" | "elsewhere"; line?: number } | null {
  if (print.line === undefined || print.range === undefined) return gitBlobId(bytes) === print.blob ? { at: "same" } : null;
  const lines = normalizedLines(bytes.toString("utf8"));
  const start = print.line - 1;
  const size = (print.end_line ?? print.line) - print.line + 1;
  if (hashLines(lines.slice(start, start + size)) === print.range) return { at: "same" };
  let found = findBlock(lines, size, print.range, start);
  if (found === null && print.loose !== undefined) found = findBlock(looseLines(lines), size, print.loose, start);
  return found === null ? null : { at: "elsewhere", line: found + 1 };
}

/**
 * Classifies one citation. `read` gives a file's bytes, or `null` when it is gone; `renames`
 * maps an old path to the one git followed it to.
 */
export function classify(print: CitationPrint, read: (path: string) => Buffer | null, renames: ReadonlyMap<string, string>): CitationState {
  const base = { component: print.component, index: print.index, path: print.path };
  const size = print.line === undefined ? 0 : (print.end_line ?? print.line) - print.line;
  const moved = (path: string, line: number | undefined): CitationState => ({
    ...base,
    state: "moved",
    now: line === undefined ? { path } : { path, line, ...(size > 0 ? { end_line: line + size } : {}) },
  });

  const bytes = read(print.path);
  if (bytes !== null) {
    const where = locate(print, bytes);
    if (where === null) return { ...base, state: "edited" };
    return where.at === "same" ? { ...base, state: "fresh" } : moved(print.path, where.line);
  }
  const renamed = renames.get(print.path);
  const renamedBytes = renamed === undefined ? null : read(renamed);
  if (renamed === undefined || renamedBytes === null) return { ...base, state: "missing" };
  const where = locate(print, renamedBytes);
  if (where === null) return { ...base, state: "edited" };
  return moved(renamed, where.at === "same" ? print.line : where.line);
}

/** The worse of two states. */
export function worse(a: Freshness, b: Freshness): Freshness {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/** Every citation's state and each box's worst, from the fingerprints in `prints`. */
export function mapFreshness(prints: Fingerprints | null, read: (path: string) => Buffer | null, renames: ReadonlyMap<string, string>): MapFreshness {
  if (prints === null) return { revision: null, createdAt: null, citations: [], boxes: {} };
  const citations = prints.citations.map((print) => classify(print, read, renames));
  const boxes: Record<string, Freshness> = {};
  for (const citation of citations) boxes[citation.component] = worse(boxes[citation.component] ?? "fresh", citation.state);
  return { revision: prints.revision, createdAt: prints.createdAt, citations, boxes };
}

/** Reads `path` below `root`, or `null` when it is not a readable file. */
export function fileReader(root: string): (path: string) => Buffer | null {
  return (path) => {
    try {
      return readFileSync(join(root, ...path.split("/")));
    } catch {
      return null;
    }
  };
}
