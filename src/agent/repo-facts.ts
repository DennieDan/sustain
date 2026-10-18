// `node <skill>/scripts/repo-facts.mjs [--focus <text>]`, run with cwd = repo root (FR-RF-01):
// creates the run folder with its run.json (CST-04) and prints where the draft goes (ADR 0018), with
// the repository's size (CST-01), the estimate for each agent (CST-03) and the read budget for its
// tier (CST-05).
import { basename, join } from "node:path";
import { collectGitFacts } from "../model/git";
import { skillEstimates } from "../model/estimate";
import { READ_BUDGET, repoSize, sizeFacts } from "../model/repoSize";
import { ARCHIFY_DIR, createRunFolder, DRAFT_FILE, runTimestamp, slugify } from "../model/runFolder";
import { newRunRecord, writeRunRecord } from "../model/runRecord";

/** The skill version, filled in by the build. */
const SKILL_VERSION = process.env.SUSTAIN_VERSION ?? "unknown";

function main(args: string[]): number {
  let focus = "";
  if (args.length === 2 && args[0] === "--focus") focus = args[1]!;
  else if (args.length !== 0) {
    process.stderr.write("repo-facts.mjs: usage: node repo-facts.mjs [--focus <text>]\n");
    return 2;
  }
  const root = process.cwd();
  // Git facts come first, so the new run folder is not among the dirty paths.
  const git = collectGitFacts(root);
  let run: string;
  try {
    run = createRunFolder(root, slugify(focus, basename(root)), runTimestamp(new Date()));
    writeRunRecord(root, join(root, ARCHIFY_DIR, run), newRunRecord({ focus, skillVersion: SKILL_VERSION }));
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
