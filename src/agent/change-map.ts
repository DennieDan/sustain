// `node .agents/skills/sustain-architecture/scripts/change-map.mjs --run-folder <runFolder> [--regenerate]`,
// run with cwd = repo root after repo-facts.mjs (FR-UPD-01..04, FR-CMP-01, FR-CMP-02): decides between
// updating the previous diagram of the same scope and regenerating, writes `lineage.json` and, in
// update mode, `change.md`, `mapping.md` and `changes.json` into the run folder, and prints one JSON object.
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  candidateRevision,
  collectChanges,
  decideMode,
  diagramComponents,
  mapChanges,
  MAX_CHANGE_BYTES,
  renderChange,
  renderMapping,
  type ModeDecision,
} from "../model/changeMap";
import { citationPathOk } from "../model/citationPath";
import { probeFile } from "../model/citations";
import { listCandidates, type Candidate } from "../model/discovery";
import { baseReachable, collectGitFacts, commitInfo, readChanges } from "../model/git";
import { readLineage, writeLineage, writeRunChanges, type Lineage } from "../model/lineage";
import { buildRunChanges } from "../model/runChanges";
import { ARCHIFY_DIR, CANDIDATE_FILE, parseRunFolderName } from "../model/runFolder";

const CHANGE_FILE = "change.md";
const MAPPING_FILE = "mapping.md";
const USAGE = "usage: node change-map.mjs --run-folder <runFolder> [--regenerate]";

interface Report {
  mode: "update" | "regenerate";
  reason: string;
  previous: string | null;
  baseRevision: string | null;
  head: string | null;
  changeFile: string | null;
  mappingFile: string | null;
  touchedComponents: string[];
  untouchedComponents: string[];
  uncitedFiles: string[];
}

function usageError(message: string): number {
  process.stderr.write(`change-map.mjs: ${message}\n`);
  return 2;
}

function parseArgs(args: string[]): { runFolder: string; regenerate: boolean } | null {
  let runFolder: string | undefined;
  let regenerate = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--regenerate" && !regenerate) regenerate = true;
    else if (args[i] === "--run-folder" && runFolder === undefined && i + 1 < args.length) runFolder = args[++i];
    else return null;
  }
  return runFolder === undefined || runFolder === "" ? null : { runFolder, regenerate };
}

/** The newest candidate of another run with the same slug, parsed; unparseable ones don't count. */
function previousCandidate(root: string, run: string, slug: string): { candidate: Candidate; doc: unknown } | null {
  const candidate = listCandidates(root).find((c) => c.runFolder !== run && parseRunFolderName(c.runFolder)?.slug === slug);
  if (!candidate) return null;
  try {
    return { candidate, doc: JSON.parse(readFileSync(candidate.file, "utf8")) };
  } catch {
    return null;
  }
}

function main(args: string[]): number {
  const parsed = parseArgs(args);
  if (!parsed) return usageError(USAGE);
  const runDir = resolve(process.cwd(), parsed.runFolder);
  const run = basename(runDir);
  const name = parseRunFolderName(run);
  if (basename(dirname(runDir)) !== ARCHIFY_DIR || !name) {
    return usageError(`expected a run folder of the form <repo>/${ARCHIFY_DIR}/architecture-<slug>-<YYYYMMDD-HHMMSS>[-N], got ${parsed.runFolder}`);
  }
  try {
    if (!statSync(runDir).isDirectory()) return usageError(`${parsed.runFolder} is not a folder`);
  } catch (error) {
    return usageError((error as Error).message);
  }
  const root = dirname(dirname(runDir));

  const previous = previousCandidate(root, run, name.slug);
  const previousLineage = previous ? readLineage(join(root, ARCHIFY_DIR, previous.candidate.runFolder)) : null;
  const git = collectGitFacts(root);
  let decision: ModeDecision = decideMode({
    requested: parsed.regenerate,
    hasPrevious: previous !== null,
    hasGit: git !== null,
    previousLineage,
    candidateRevision: previous ? candidateRevision(previous.doc) : null,
    baseReachable: (base) => baseReachable(root, base),
  });

  const report: Report = {
    mode: decision.mode,
    reason: decision.reason,
    previous: previous ? `${ARCHIFY_DIR}/${previous.candidate.runFolder}/${CANDIDATE_FILE}` : null,
    baseRevision: decision.base,
    head: git?.head ?? null,
    changeFile: null,
    mappingFile: null,
    touchedComponents: [],
    untouchedComponents: [],
    uncitedFiles: [],
  };

  try {
    if (decision.mode === "update" && previous && git) {
      const components = diagramComponents(previous.doc);
      const cited = new Set(components.flatMap((component) => [...component.paths]));
      const reads = readChanges(root, decision.base);
      const rootReal = realpathSync(root);
      const changes = reads && collectChanges({
        ...reads,
        previousDirty: previousLineage?.dirty ?? [],
        cited,
        exists: (path) => existsSync(join(root, path)),
        readUntracked: (path) =>
          citationPathOk(path) && probeFile(rootReal, path).kind === "text" ? readFileSync(join(rootReal, path), "utf8") : null,
      });
      const map = changes && mapChanges(components, changes);
      const change = map && renderChange(decision.base, git.head, map);
      if (!map || !change || Buffer.byteLength(change, "utf8") > MAX_CHANGE_BYTES) {
        decision = { mode: "regenerate", reason: "change-too-large", base: decision.base };
        Object.assign(report, { mode: decision.mode, reason: decision.reason });
      } else {
        writeFileSync(join(runDir, CHANGE_FILE), change);
        writeFileSync(join(runDir, MAPPING_FILE), renderMapping(decision.base, git.head, map));
        writeRunChanges(runDir, buildRunChanges(map, decision.base, git.head));
        Object.assign(report, {
          changeFile: `${ARCHIFY_DIR}/${run}/${CHANGE_FILE}`,
          mappingFile: `${ARCHIFY_DIR}/${run}/${MAPPING_FILE}`,
          touchedComponents: map.touchedComponents.map((component) => component.id),
          untouchedComponents: map.untouched.map((component) => component.id),
          uncitedFiles: map.uncited.map((entry) => entry.path),
        });
      }
    }

    const lineage: Lineage = {
      mode: decision.mode,
      reason: decision.reason,
      previousRun: previous?.candidate.runFolder ?? null,
      baseRevision: decision.base,
      revision: git?.head ?? null,
      baseCommit: git && decision.base !== null ? commitInfo(root, decision.base) : null,
      headCommit: git ? commitInfo(root, git.head) : null,
      dirty: git?.dirty ?? [],
      dirtyCount: git?.dirtyCount ?? 0,
      updatesSinceRegeneration: decision.mode === "update" ? (previousLineage?.updatesSinceRegeneration ?? 0) + 1 : 0,
    };
    writeLineage(runDir, lineage);
  } catch (error) {
    return usageError((error as Error).message);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
