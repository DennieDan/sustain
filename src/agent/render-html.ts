// `node <skill>/scripts/render-html.mjs <repo>/.archify/<run>/candidate.json [--share]` (RCH-01):
// writes the diagram page beside the candidate, as `meta.output` names it. The page embeds the map
// and the repository's absolute path; `--share` leaves the path out for a page meant for others.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { assertWritable, isWithin } from "../model/confine";
import { pageOutput, renderPage } from "../model/page";
import { ARCHIFY_DIR, CANDIDATE_FILE, RUN_NAME_PATTERN } from "../model/runFolder";
import { readDiagram } from "../model/tolerant";
import { isJsonObject, type Repository } from "../model/types";

/** The page script and stylesheet, filled in by the build. */
const ASSETS = { script: process.env.SUSTAIN_PAGE_SCRIPT ?? "", style: process.env.SUSTAIN_PAGE_STYLE ?? "" };

function fail(message: string): number {
  process.stderr.write(`render-html.mjs: ${message}\n`);
  return 2;
}

function main(args: string[]): number {
  const share = args[1] === "--share";
  if (args.length < 1 || args.length > 2 || (args.length === 2 && !share)) return fail(`usage: node render-html.mjs <repo>/${ARCHIFY_DIR}/<run>/${CANDIDATE_FILE} [--share]`);
  const candidate = resolve(process.cwd(), args[0]!);
  const runDir = dirname(candidate);
  const run = basename(runDir);
  const root = dirname(dirname(runDir));
  if (basename(candidate) !== CANDIDATE_FILE || basename(dirname(runDir)) !== ARCHIFY_DIR || !RUN_NAME_PATTERN.test(run)) {
    return fail(`expected a path of the form <repo>/${ARCHIFY_DIR}/<run>/${CANDIDATE_FILE}, got ${args[0]}`);
  }
  let doc: unknown;
  try {
    if (!isWithin(realpathSync(root), realpathSync(candidate))) return fail(`${args[0]} lies outside the repository`);
    doc = JSON.parse(readFileSync(candidate, "utf8"));
  } catch (error) {
    return fail(`cannot read ${args[0]}: ${(error as Error).message}`);
  }
  const read = readDiagram(doc);
  const meta = isJsonObject(doc) && isJsonObject(doc["meta"]) ? doc["meta"] : {};
  const repository = isJsonObject(meta["repository"]) ? (meta["repository"] as unknown as Repository) : null;
  const name = pageOutput(run, doc);
  try {
    const out = join(runDir, name);
    assertWritable(root, out);
    const data = { title: (read.ok ? read.diagram.title : undefined) ?? run, doc, root: share ? null : root, project: share ? null : basename(root), repository };
    writeFileSync(out, renderPage(data, ASSETS));
  } catch (error) {
    return fail(`cannot write ${name}: ${(error as Error).message}`);
  }
  process.stdout.write(`${JSON.stringify({ status: "written", page: `${ARCHIFY_DIR}/${run}/${name}` }, null, 2)}\n`);
  return 0;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
