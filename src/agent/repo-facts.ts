// `node <skill>/scripts/repo-facts.mjs [--focus <text>] [--parent <run>]`, run with cwd = repo root
// (FR-RF-01): creates the run folder with its run.json (CST-04) and prints where the draft goes
// (ADR 0018), with the repository's size (CST-01), the estimate for each agent (CST-03) and the read
// budget for its tier (CST-05). With `--parent`, the run is a drill-down of that map (VWR-05).
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { collectGitFacts } from "../model/git";
import { skillEstimates } from "../model/estimate";
import { READ_BUDGET, repoSize, sizeFacts } from "../model/repoSize";
import { ARCHIFY_DIR, CANDIDATE_FILE, createRunFolder, DRAFT_FILE, parseRunFolderName, runTimestamp, slugify } from "../model/runFolder";
import { newRunRecord, writeRunRecord } from "../model/runRecord";

/** The skill version, filled in by the build. */
const SKILL_VERSION = process.env.SUSTAIN_VERSION ?? "unknown";

const USAGE = "repo-facts.mjs: usage: node repo-facts.mjs [--focus <text>] [--parent <run>]\n";

function main(args: string[]): number {
  let focus = "";
  let parent: string | null = null;
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (value === undefined || (args[i] !== "--focus" && args[i] !== "--parent")) {
      process.stderr.write(USAGE);
      return 2;
    }
    if (args[i] === "--focus") focus = value;
    else parent = value;
  }
  const root = process.cwd();
  if (parent !== null && (!parseRunFolderName(parent) || !existsSync(join(root, ARCHIFY_DIR, parent, CANDIDATE_FILE)))) {
    process.stderr.write(`repo-facts.mjs: --parent names no accepted map in ${ARCHIFY_DIR}/: ${parent}\n`);
    return 2;
  }
  // Git facts come first, so the new run folder is not among the dirty paths.
  const git = collectGitFacts(root);
  let run: string;
  try {
    run = createRunFolder(root, slugify(focus, basename(root)), runTimestamp(new Date()));
    writeRunRecord(root, join(root, ARCHIFY_DIR, run), newRunRecord({ focus, skillVersion: SKILL_VERSION, ...(parent === null ? {} : { kind: "drill" as const, parent }) }));
  } catch (error) {
    process.stderr.write(`repo-facts.mjs: ${(error as Error).message}\n`);
    return 2;
  }
  const size = repoSize(root);
  const facts = {
    root,
    runFolder: `${ARCHIFY_DIR}/${run}`,
    draft: `${ARCHIFY_DIR}/${run}/${DRAFT_FILE}`,
    git: git && { head: git.head, origin: git.origin, dirtyCount: git.dirtyCount, dirty: git.dirty },
    size,
    estimate: skillEstimates(sizeFacts(size), "full"),
    budget: READ_BUDGET[size.tier],
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
  return 0;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
