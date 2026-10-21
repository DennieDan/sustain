// The baseline of the change view (FR-CMP-05, FR-CMP-06, ADR 0031): the default baseline, the
// `compare` part of the load message and the Compare with… items. No `vscode` import, so the
// rules are unit-tested in Node; viewer.ts shows the results.
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { compareRuns, pickerTags, type RunFacts } from "../core/comparison";
import { listCandidates, type Candidate } from "../core-node/discovery";
import type { Lineage } from "../core/lineage";
import { readLineage, readRunChanges } from "../core-node/lineage";
import type { Compare } from "../viewer/protocol";
import { ARCHIFY_DIR, CANDIDATE_FILE, parseRunFolderName } from "../core-node/runFolder";
import { parseDiagram, type ViewDiagram } from "../core/tolerant";
import { isRecord, type Repository } from "../core/types";

/** Characters of a revision shown in the picker. */
const SHORT_HASH = 7;

/** A diagram file read with the tolerant parse. */
interface ReadDiagram {
  diagram: ViewDiagram;
  repository: Repository | null;
}

/** `meta.repository` when it has string `url` and `revision`, else `null`. */
function repositoryOf(value: unknown): Repository | null {
  if (!isRecord(value) || !isRecord(value["meta"])) return null;
  const repository = value["meta"]["repository"];
  if (!isRecord(repository)) return null;
  const { url, revision } = repository;
  return typeof url === "string" && typeof revision === "string" ? { url, revision } : null;
}

/** `file` parsed with `parseDiagram`, or `null` when it can't be read or drawn. */
function readDiagramFile(file: string): ReadDiagram | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const result = parseDiagram(text);
  return result.ok ? { diagram: result.diagram, repository: repositoryOf(result.value) } : null;
}

/** A run folder name usable as one path segment below `.archify/` (lineage data is repo text). */
function isRunSegment(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !/[/\\]/.test(name);
}

/** The run folder of `file` when it is `<root>/.archify/<run>/candidate.sir`, else `null`. */
function candidateRun(root: string, file: string): string | null {
  const runDir = dirname(resolve(file));
  const archify = dirname(runDir);
  if (basename(file) !== CANDIDATE_FILE || basename(archify) !== ARCHIFY_DIR || dirname(archify) !== resolve(root)) return null;
  return basename(runDir);
}

/**
 * How a diagram file is named in the header, the picker and messages: its run folder when it
 * is `<…>/.archify/<run>/<name>`, else its base name.
 */
export function runFolderOf(file: string): string {
  const runDir = dirname(file);
  return basename(dirname(runDir)) === ARCHIFY_DIR ? basename(runDir) : basename(file);
}

/** `runFolder → lineage` below `<root>/.archify/`, each read at most once. */
function lineageReader(root: string): (runFolder: string) => Lineage | null {
  const cache = new Map<string, Lineage | null>();
  return (runFolder) => {
    if (!isRunSegment(runFolder)) return null;
    let lineage = cache.get(runFolder);
    if (lineage === undefined) {
      lineage = readLineage(join(root, ARCHIFY_DIR, runFolder));
      cache.set(runFolder, lineage);
    }
    return lineage;
  };
}

/**
 * FR-CMP-05 default baseline: `<root>/.archify/<lineage.previousRun>/candidate.sir` when `file`
 * is `<root>/.archify/<run>/candidate.sir` with a lineage, that previous candidate is listed by
 * `listCandidates(root)` and it parses with the tolerant parse. Otherwise `null`.
 */
export function defaultBaseline(root: string, file: string): string | null {
  const run = candidateRun(root, file);
  if (run === null) return null;
  const previous = readLineage(join(root, ARCHIFY_DIR, run))?.previousRun;
  if (!previous || previous === run || !isRunSegment(previous)) return null;
  const baseline = listCandidates(root).find((candidate) => candidate.runFolder === previous)?.file;
  return baseline !== undefined && readDiagramFile(baseline) ? baseline : null;
}

/**
 * The FR-CMP-04 facts of `file`. `order` is its index in `candidates` (newest first); a file
 * outside the run order gets `missingOrder`, so it never counts as newer than the other side.
 */
function runFacts(
  root: string,
  file: string,
  read: ReadDiagram | null,
  candidates: readonly Candidate[],
  missingOrder: number,
  lineageOf: (runFolder: string) => Lineage | null,
): RunFacts {
  const run = candidateRun(root, file);
  const order = candidates.findIndex((candidate) => candidate.file === file);
  return {
    runFolder: run ?? runFolderOf(file),
    slug: run === null ? null : (parseRunFolderName(run)?.slug ?? null),
    order: order === -1 ? missingOrder : order,
    lineage: run === null ? null : lineageOf(run),
    repository: read?.repository ?? null,
    componentIds: read?.diagram.components.map((component) => component.id) ?? [],
  };
}

/** Run order of an open file outside the run order: before every candidate. */
const OPEN_OUTSIDE_ORDER = -1;
/** Run order of a baseline outside the run order: after every candidate. */
const BASELINE_OUTSIDE_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * The `compare` part of the load message for the open `file` (repo `root`) and `baselineFile`
 * (FR-CMP-05): the baseline doc, the FR-CMP-04 context and, when `context.keptAvailable`, the
 * open run's `changes.json`. `null` when the baseline can't be read or parsed.
 */
export function buildCompare(root: string, file: string, baselineFile: string): Compare | null {
  let baselineText: string;
  try {
    baselineText = readFileSync(baselineFile, "utf8");
  } catch {
    return null;
  }
  const parsed = parseDiagram(baselineText);
  if (!parsed.ok) return null;
  const candidates = listCandidates(root);
  const lineageOf = lineageReader(root);
  const current = runFacts(root, file, readDiagramFile(file), candidates, OPEN_OUTSIDE_ORDER, lineageOf);
  const baselineRead = { diagram: parsed.diagram, repository: repositoryOf(parsed.value) };
  const baseline = runFacts(root, baselineFile, baselineRead, candidates, BASELINE_OUTSIDE_ORDER, lineageOf);
  const run = candidateRun(root, file);
  const changes = run === null ? null : readRunChanges(join(root, ARCHIFY_DIR, run));
  const context = compareRuns(current, baseline, lineageOf, changes !== null);
  return { baselineDoc: parsed.value, baselineFile, context, changes: context.keptAvailable ? changes : null };
}

/** One Compare with… entry; `file` is the baseline it selects (`null` = no comparison). */
export interface PickerItem {
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
  file: string | null;
}

export const NO_COMPARISON = "No comparison";

/** `<short hash> <subject> · <mode>` from the lineage, else the short `meta.repository.revision`. */
function commitDetail(lineage: Lineage | null, repository: Repository | null): string {
  if (lineage) {
    const commit = [lineage.revision?.slice(0, SHORT_HASH), lineage.headCommit?.subject].filter((part) => part !== undefined && part !== "");
    return [...(commit.length > 0 ? [commit.join(" ")] : []), lineage.mode].join(" · ");
  }
  return repository ? repository.revision.slice(0, SHORT_HASH) : "";
}

/**
 * FR-CMP-06 Compare with… items for the open `file` (repo `root`): "No comparison", then every
 * other candidate of `root` that parses, in run order. Label `meta.title` (else the run folder),
 * description the run folder, detail the commit and the `pickerTags`, ` · `-joined. The item of
 * `baselineFile` (or "No comparison" when it is `null`) is `picked`.
 */
export function pickerItems(root: string, file: string, baselineFile: string | null): PickerItem[] {
  const items: PickerItem[] = [{ label: NO_COMPARISON, file: null, ...(baselineFile === null ? { picked: true } : {}) }];
  const candidates = listCandidates(root);
  const lineageOf = lineageReader(root);
  const current = runFacts(root, file, readDiagramFile(file), candidates, OPEN_OUTSIDE_ORDER, lineageOf);
  for (const candidate of candidates) {
    if (candidate.file === file) continue;
    const read = readDiagramFile(candidate.file);
    if (!read) continue;
    const other = runFacts(root, candidate.file, read, candidates, BASELINE_OUTSIDE_ORDER, lineageOf);
    const detail = [commitDetail(other.lineage, read.repository), ...pickerTags(current, other, lineageOf)].filter((part) => part !== "").join(" · ");
    items.push({
      label: read.diagram.title ?? candidate.runFolder,
      description: candidate.runFolder,
      ...(detail !== "" ? { detail } : {}),
      ...(candidate.file === baselineFile ? { picked: true } : {}),
      file: candidate.file,
    });
  }
  return items;
}
