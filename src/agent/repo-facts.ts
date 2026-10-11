// `node .agents/skills/sustain-architecture/scripts/repo-facts.mjs [--focus <text>]`, run with
// cwd = repo root (FR-RF-01): creates the run folder and prints where the draft goes (ADR 0018).
import { basename } from "node:path";
import { collectGitFacts } from "../model/git";
import { ARCHIFY_DIR, createRunFolder, DRAFT_FILE, runTimestamp, slugify } from "../model/runFolder";

function main(args: string[]): number {
  let focus = "";
  if (args.length === 2 && args[0] === "--focus") focus = args[1]!;
  else if (args.length !== 0) {
    process.stderr.write("repo-facts.mjs: usage: node repo-facts.mjs [--focus <text>]\n");
    return 2;
  }
  const root = process.cwd();
  let run: string;
  try {
    run = createRunFolder(root, slugify(focus, basename(root)), runTimestamp(new Date()));
  } catch (error) {
    process.stderr.write(`repo-facts.mjs: ${(error as Error).message}\n`);
    return 2;
  }
  const git = collectGitFacts(root);
  const facts = {
    root,
    runFolder: `${ARCHIFY_DIR}/${run}`,
    draft: `${ARCHIFY_DIR}/${run}/${DRAFT_FILE}`,
    git: git && { head: git.head, origin: git.origin, dirtyCount: git.dirtyCount, dirty: git.dirty },
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
  return 0;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
