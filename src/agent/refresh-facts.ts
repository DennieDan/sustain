// `node <skill>/scripts/refresh-facts.mjs --from <run> [--paths <glob>…]`, run with cwd = repo
// root (FRS-05): reports how the base map compares with the code since it was made, then creates
// the refresh's run folder with a draft that starts from the base map. Prints the refresh's estimate
// for each agent (CST-03).
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { assertWritable, isWithin } from "../model/confine";
import { readFingerprints, fileReader, mapFreshness } from "../model/staleness";
import { skillEstimates } from "../model/estimate";
import { foldersAt, numstatSince, renamesSince, untrackedFiles } from "../model/git";
import { globToRegExp, refreshReport } from "../model/refresh";
import { repoSize, sizeFacts } from "../model/repoSize";
import { ARCHIFY_DIR, CANDIDATE_FILE, createRunFolder, DRAFT_FILE, runTimestamp, slugify } from "../model/runFolder";
import { newRunRecord, readRunRecord, writeRunRecord } from "../model/runRecord";
import { stripAppOwned } from "../model/submission";
import { isJsonObject } from "../model/types";

/** The skill version, filled in by the build. */
const SKILL_VERSION = process.env.SUSTAIN_VERSION ?? "unknown";

/** Top-level folders that hold no source of their own. */
const NOT_SOURCE = new Set(["node_modules", "dist", "out", "build", "coverage", "target", "vendor"]);

const USAGE = "usage: node refresh-facts.mjs --from <run> [--paths <glob>…]";

function fail(message: string): number {
  process.stderr.write(`refresh-facts.mjs: ${message}\n`);
  return 2;
}

/** The arguments, or a usage error. */
function parseArgs(args: string[]): { from: string; paths: string[] } | string {
  if (args[0] !== "--from" || args[1] === undefined) return USAGE;
  if (args.length === 2) return { from: args[1], paths: [] };
  if (args[2] !== "--paths" || args.length === 3) return USAGE;
  return { from: args[1], paths: args.slice(3) };
}

/** Citation paths of every box in a parsed map. */
function citedPaths(doc: unknown): Set<string> {
  const cited = new Set<string>();
  const components = isJsonObject(doc) && Array.isArray(doc["components"]) ? doc["components"] : [];
  for (const component of components) {
    const sources = isJsonObject(component) && Array.isArray(component["sources"]) ? component["sources"] : [];
    for (const source of sources) if (isJsonObject(source) && typeof source["path"] === "string") cited.add(source["path"]);
  }
  return cited;
}

function topLevelFolders(root: string): string[] {
  return readdirSync(root)
    .filter((name) => !name.startsWith(".") && !NOT_SOURCE.has(name))
    .filter((name) => {
      try {
        return statSync(join(root, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function main(args: string[]): number {
  const parsed = parseArgs(args);
  if (typeof parsed === "string") return fail(parsed);
  const root = process.cwd();
  const base = parsed.from.replace(/^\.archify\//, "").replace(/\/+$/, "");
  if (!/^[a-z0-9]+-[A-Za-z0-9._-]+$/.test(base) || base.includes("..")) return fail(`--from names a run folder in ${ARCHIFY_DIR}/, such as architecture-app-20261018-120000`);
  const baseDir = join(root, ARCHIFY_DIR, base);
  let doc: unknown;
  try {
    const candidate = join(baseDir, CANDIDATE_FILE);
    if (!isWithin(realpathSync(root), realpathSync(candidate))) return fail(`${ARCHIFY_DIR}/${base}/${CANDIDATE_FILE} lies outside the repository`);
    doc = JSON.parse(readFileSync(candidate, "utf8"));
  } catch (error) {
    return fail(`cannot read ${ARCHIFY_DIR}/${base}/${CANDIDATE_FILE}: ${(error as Error).message}`);
  }

  const globs = parsed.paths.map(globToRegExp);
  const prints = readFingerprints(baseDir);
  const revision = prints?.revision ?? null;
  // Git comes first, so the new run folder is not among the changes.
  const outsideMaps = (path: string): boolean => !path.startsWith(`${ARCHIFY_DIR}/`);
  const changes = revision === null ? null : (numstatSince(root, revision) ?? []).filter((change) => outsideMaps(change.path));
  const untracked = revision === null ? [] : untrackedFiles(root).filter(outsideMaps);
  const freshness = mapFreshness(prints, fileReader(root), revision === null ? new Map() : renamesSince(root, revision));
  const report = refreshReport({
    freshness,
    cited: citedPaths(doc),
    changes,
    untracked,
    foldersNow: topLevelFolders(root),
    foldersThen: revision === null ? null : foldersAt(root, revision),
    globs,
  });

  const focus = readRunRecord(baseDir)?.focus ?? "";
  let run: string;
  try {
    run = createRunFolder(root, slugify(focus, basename(root)), runTimestamp(new Date()));
    const runDir = join(root, ARCHIFY_DIR, run);
    writeRunRecord(root, runDir, newRunRecord({ kind: "refresh", focus, paths: parsed.paths, base, skillVersion: SKILL_VERSION }));
    const draft = join(runDir, DRAFT_FILE);
    assertWritable(root, draft);
    writeFileSync(draft, `${JSON.stringify(stripAppOwned(doc), null, 2)}\n`);
  } catch (error) {
    return fail((error as Error).message);
  }

  const facts = {
    root,
    runFolder: `${ARCHIFY_DIR}/${run}`,
    draft: `${ARCHIFY_DIR}/${run}/${DRAFT_FILE}`,
    base: { runFolder: `${ARCHIFY_DIR}/${base}`, revision, createdAt: prints?.createdAt ?? null, fingerprints: prints !== null },
    paths: parsed.paths,
    boxes: report.boxes,
    stale: report.stale,
    changes: report.changes,
    uncovered: report.uncovered,
    newFolders: report.newFolders,
    estimate: skillEstimates(sizeFacts(repoSize(root)), "refresh"),
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
  return 0;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
