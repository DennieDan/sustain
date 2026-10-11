// Finding `<root>/.archify/*/candidate.json` and ordering them newest first (FR-VIEW-02).
import { readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { ARCHIFY_DIR, CANDIDATE_FILE, parseRunFolderName } from "./runFolder";

/**
 * The repo root for a diagram file: `<R>` when the file is `<R>/.archify/<run>/<name>`,
 * otherwise `fallbackRoot` (the chosen workspace folder; FR-VIEW-01).
 */
export function repoRootFor(file: string, fallbackRoot: string): string {
  const archify = dirname(dirname(file));
  return basename(archify) === ARCHIFY_DIR ? dirname(archify) : fallbackRoot;
}

export interface Candidate {
  /** Run folder name below `.archify/`. */
  runFolder: string;
  /** Absolute path of `candidate.json`. */
  file: string;
  /** Modification time of `candidate.json` in ms. */
  mtimeMs: number;
}

/**
 * Newest first. Folders named `architecture-<slug>-<YYYYMMDD-HHMMSS>[-N]` sort by timestamp,
 * then `N`, descending; all other folders come after them, by `mtimeMs` descending. Remaining
 * ties fall back to the folder name, descending, so the order is total.
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  const ra = parseRunFolderName(a.runFolder);
  const rb = parseRunFolderName(b.runFolder);
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  if (ra && rb) {
    if (ra.timestamp !== rb.timestamp) return ra.timestamp < rb.timestamp ? 1 : -1;
    if (ra.n !== rb.n) return rb.n - ra.n;
  } else if (a.mtimeMs !== b.mtimeMs) {
    return b.mtimeMs - a.mtimeMs;
  }
  return a.runFolder < b.runFolder ? 1 : a.runFolder > b.runFolder ? -1 : 0;
}

/**
 * Every `.archify/<folder>/candidate.json` under `root` that is a regular file whose real
 * path stays inside the root, newest first. A missing `.archify` gives `[]`.
 */
export function listCandidates(root: string): Candidate[] {
  let rootReal: string;
  let folders: string[];
  try {
    rootReal = realpathSync(root);
    folders = readdirSync(join(root, ARCHIFY_DIR));
  } catch {
    return [];
  }
  const candidates: Candidate[] = [];
  for (const runFolder of folders) {
    const file = join(root, ARCHIFY_DIR, runFolder, CANDIDATE_FILE);
    try {
      const real = realpathSync(file);
      if (!real.startsWith(rootReal + sep)) continue;
      const stat = statSync(real);
      if (stat.isFile()) candidates.push({ runFolder, file, mtimeMs: stat.mtimeMs });
    } catch {
      // No candidate.json in this folder (a running or failed run): not a diagram.
    }
  }
  return candidates.sort(compareCandidates);
}
