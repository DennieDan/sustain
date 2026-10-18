// `npm run eval:check-truth [-- --repo <id>]` (ACC-04): checks each ground truth. Its ids must be
// unique and its edges and groups must name them; its revision must be the corpus's pinned commit;
// and each glob must match a file of that commit in the bench's cached clone (CST-06), which it
// clones or fetches when needed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCorpus, type CorpusEntry } from "../bench/lib/corpus";
import { benchCache, cloneSource, mirrorPath } from "../bench/lib/isolate";
import { findOnPath } from "../src/model/which";
import { readTruth, structureProblems, unmatchedGlobs } from "./lib/truth";

function git(cwd: string, args: string[]): string | null {
  const program = findOnPath("git", process.env);
  if (program === undefined) return null;
  const result = spawnSync(program, ["-c", "core.fsmonitor=false", ...args], { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, maxBuffer: 256 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

/** The files of `revision` in the cached clone of `entry`, cloning or fetching as needed. */
function filesAt(entry: CorpusEntry, repoRoot: string, revision: string): string[] | null {
  const mirror = mirrorPath(benchCache(process.env), entry);
  mkdirSync(dirname(mirror), { recursive: true });
  if (!existsSync(mirror)) git(dirname(mirror), ["clone", "-q", "--mirror", cloneSource(entry, repoRoot), mirror]);
  if (git(mirror, ["cat-file", "-e", `${revision}^{commit}`]) === null) git(mirror, ["fetch", "-q", "origin"]);
  const listing = git(mirror, ["ls-tree", "-r", "--name-only", revision]);
  return listing === null ? null : listing.split("\n").filter(Boolean);
}

export function main(argv: readonly string[], write: (text: string) => void, repoRoot = resolve(".")): number {
  const only = argv.indexOf("--repo") >= 0 ? argv[argv.indexOf("--repo") + 1] : undefined;
  const corpus = readCorpus(join(repoRoot, "bench/corpus.json"));
  const ids = readdirSync(join(repoRoot, "eval/ground-truth")).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, "")).filter((id) => only === undefined || id === only);
  let failed = false;
  for (const id of ids) {
    const truth = readTruth(repoRoot, id);
    if (truth === null) {
      write(`${id}: not readable JSON\n`);
      failed = true;
      continue;
    }
    const entry = corpus.find((candidate) => candidate.id === truth.repo);
    const problems = structureProblems(truth, entry);
    if (entry !== undefined && problems.length === 0) {
      const files = filesAt(entry, repoRoot, truth.revision);
      if (files === null) problems.push(`cannot list the files of ${truth.revision}`);
      else problems.push(...unmatchedGlobs(truth, files));
    }
    write(problems.length === 0 ? `${id}: ok\n` : problems.map((problem) => `${id}: ${problem}\n`).join(""));
    failed ||= problems.length > 0;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), (text) => process.stdout.write(text));
}
