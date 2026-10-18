// RCH-03: the core CLI's commands. Each returns one JSON-able result, its markdown, and an exit
// code with the validator's meaning: 0 done or passed, 1 a finding that fails, 2 a usage or I/O
// error. The extension, the Action and the IntelliJ plugin call the same model modules.
import { readFileSync, writeFileSync } from "node:fs";
import { postUpload } from "../cloud/client";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { markChanges, parseDiff, rangeOf, type FileChange } from "../model/changes";
import { loadConfig, mainMap, runCheck } from "../model/check";
import { assertWritable } from "../model/confine";
import { FAIL_ON, type FailOn } from "../model/config";
import { deltaMarkdown, escapeMarkdown } from "../model/deltaMarkdown";
import { collectGitFacts, currentBranch, diffFor, renamesSince } from "../model/git";
import { checkSkill, diffSize, type AgentId, type SkillHashes } from "../model/integrity";
import { pageOutput, renderPage } from "../model/page";
import { runPreflight } from "../model/preflight";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "../model/runFolder";
import { fileReader, mapFreshness, readFingerprints } from "../model/staleness";
import { readDiagram } from "../model/tolerant";
import { checkUpload, githubSlug, mapPayload } from "../model/upload";
import { readRunRecord } from "../model/runRecord";
import { isJsonObject, type Repository } from "../model/types";
import { SKILL_NAMES, skillBase, skillTargets, writeSkill } from "../extension/skillFiles";

export interface CommandResult {
  exitCode: 0 | 1 | 2;
  json: unknown;
  markdown: string;
}

/** Where the CLI found itself: the shipped skills, their hashes and the page assets sit beside it. */
export interface CliHome {
  skills: string;
  hashes: string;
  page: { script: string; style: string };
}

export interface CliArgs {
  root: string;
  options: Map<string, string[]>;
  home: CliHome;
  env: NodeJS.ProcessEnv;
}

function one(args: CliArgs, name: string): string | undefined {
  return args.options.get(name)?.[0];
}

export function usage(message: string): CommandResult {
  return { exitCode: 2, json: { status: "error", message }, markdown: `**Error:** ${escapeMarkdown(message)}\n` };
}

function list(title: string, items: string[]): string {
  return items.length === 0 ? "" : `\n**${title}**\n\n${items.map((item) => `- ${item}`).join("\n")}\n`;
}

/** The map a command works on: `--map`, the config's `map`, else the main map. */
function chosenMap(args: CliArgs): { run: string; dir: string; doc: unknown } | string {
  const config = loadConfig(args.root);
  if (!config.ok) return config.reason;
  const run = one(args, "--map") ?? config.config.map ?? mainMap(args.root);
  if (run === undefined || run === null) return "No map. Generate one with an empty focus, or name one with --map.";
  if (!/^[a-z0-9]+-[A-Za-z0-9._-]+$/.test(run)) return "--map names a run folder in .archify/";
  const dir = join(args.root, ARCHIFY_DIR, run);
  try {
    return { run, dir, doc: JSON.parse(readFileSync(join(dir, CANDIDATE_FILE), "utf8")) };
  } catch (error) {
    return `Cannot read ${ARCHIFY_DIR}/${run}/${CANDIDATE_FILE}: ${(error as Error).message}`;
  }
}

export function install(args: CliArgs): CommandResult {
  const scope = one(args, "--scope") ?? "user";
  if (scope !== "user" && scope !== "project") return usage("--scope is user or project");
  const base = skillBase(scope, args.root, args.env["HOME"] ?? args.env["USERPROFILE"] ?? homedir());
  const installed: string[] = [];
  try {
    for (const name of SKILL_NAMES) {
      writeSkill(base, join(args.home.skills, name), skillTargets(base, name), name);
      installed.push(name);
    }
  } catch (error) {
    return usage(`cannot install: ${(error as Error).message}`);
  }
  return { exitCode: 0, json: { status: "installed", base, skills: installed }, markdown: `Installed ${installed.join(", ")} in \`${base}\`.\n` };
}

export function verifySkills(args: CliArgs): CommandResult {
  const agent = (one(args, "--agent") ?? "claude") as AgentId;
  if (!["claude", "codex", "devin"].includes(agent)) return usage("--agent is claude, codex or devin");
  const scope = one(args, "--scope") ?? "user";
  if (scope !== "user" && scope !== "project") return usage("--scope is user or project");
  let hashes: SkillHashes;
  try {
    hashes = JSON.parse(readFileSync(args.home.hashes, "utf8")) as SkillHashes;
  } catch (error) {
    return usage(`cannot read the shipped skill hashes: ${(error as Error).message}`);
  }
  const base = skillBase(scope, args.root, args.env["HOME"] ?? args.env["USERPROFILE"] ?? homedir());
  const skills: Record<string, { intact: boolean; differing: number | null; otherCopies: string[] }> = {};
  for (const [name, expected] of Object.entries(hashes.skills)) {
    if (agent === "devin" && name !== "sustain-bugfix") continue;
    const check = checkSkill(base, args.root, agent, name, expected);
    const differing = check.diff === null ? null : diffSize(check.diff);
    skills[name] = { intact: differing === 0 && check.differingCopies.length === 0, differing, otherCopies: check.differingCopies };
  }
  const intact = Object.values(skills).every((skill) => skill.intact);
  const lines = Object.entries(skills).map(([name, skill]) => `${name}: ${skill.intact ? "intact" : skill.differing === null ? "not installed" : `${skill.differing} file(s) differ`}`);
  return { exitCode: intact ? 0 : 1, json: { status: intact ? "intact" : "differs", version: hashes.version, agent, skills }, markdown: list(`Skills for ${agent}`, lines) };
}

export function staleness(args: CliArgs): CommandResult {
  const map = chosenMap(args);
  if (typeof map === "string") return usage(map);
  const prints = readFingerprints(map.dir);
  const renames = prints?.revision ? renamesSince(args.root, prints.revision, args.env) : new Map<string, string>();
  const state = mapFreshness(prints, fileReader(args.root), renames);
  const stale = state.citations.filter((citation) => citation.state !== "fresh");
  return {
    exitCode: 0,
    json: { map: map.run, revision: state.revision, fingerprints: prints !== null, boxes: state.boxes, citations: stale },
    markdown: list(`Map ${map.run}`, Object.entries(state.boxes).map(([id, box]) => `${escapeMarkdown(id)}: ${box}`)),
  };
}

export function changes(args: CliArgs): CommandResult {
  const map = chosenMap(args);
  if (typeof map === "string") return usage(map);
  const scopeName = one(args, "--scope") ?? "uncommitted";
  let scope: Parameters<typeof diffFor>[1];
  if (scopeName === "uncommitted" || scopeName === "branch") scope = { kind: scopeName };
  else if (scopeName === "range") {
    const range = rangeOf(one(args, "--range") ?? "");
    if (range === null) return usage("--scope range needs --range <from>..<to>");
    scope = { kind: "range", ...range };
  } else return usage("--scope is uncommitted, branch or range");
  const diff = diffFor(args.root, scope, args.env);
  if (!diff.ok) return usage(diff.reason);
  const read = readDiagram(map.doc);
  const fileChanges: FileChange[] = [...parseDiff(diff.text), ...diff.untracked.map((path): FileChange => ({ path, oldPath: path, status: "added", hunks: [] }))];
  const marks = markChanges(read.ok ? read.diagram.components : [], fileChanges);
  return {
    exitCode: 0,
    json: { map: map.run, scope: scopeName, ...marks },
    markdown: list("Touched strongly", marks.strong.map(escapeMarkdown)) + list("Touched weakly", marks.weak.map(escapeMarkdown)) + list("Not on the map", marks.uncovered.map(escapeMarkdown)),
  };
}

export function exportPage(args: CliArgs): CommandResult {
  const map = chosenMap(args);
  if (typeof map === "string") return usage(map);
  const share = args.options.has("--share");
  const read = readDiagram(map.doc);
  const meta = isJsonObject(map.doc) && isJsonObject(map.doc["meta"]) ? map.doc["meta"] : {};
  const repository = isJsonObject(meta["repository"]) ? (meta["repository"] as unknown as Repository) : null;
  const name = pageOutput(map.run, map.doc);
  const out = join(map.dir, name);
  try {
    assertWritable(args.root, out);
    const data = { title: (read.ok ? read.diagram.title : undefined) ?? map.run, doc: map.doc, root: share ? null : args.root, project: share ? null : basename(args.root), repository };
    writeFileSync(out, renderPage(data, args.home.page));
  } catch (error) {
    return usage(`cannot write the page: ${(error as Error).message}`);
  }
  const page = `${ARCHIFY_DIR}/${map.run}/${name}`;
  return { exitCode: 0, json: { status: "written", page }, markdown: `Wrote \`${page}\`.\n` };
}

export async function preflight(args: CliArgs): Promise<CommandResult> {
  const verified = verifySkills(args);
  const checks = await runPreflight({ env: args.env, root: args.root, skillsIntact: verified.exitCode === 0 });
  const ok = checks.every((check) => check.ok);
  return {
    exitCode: ok ? 0 : 1,
    json: { status: ok ? "ready" : "needs-attention", checks },
    markdown: list("Setup", checks.map((check) => `${check.ok ? "✓" : "✗"} ${escapeMarkdown(check.detail)}${check.fix ? ` (${escapeMarkdown(check.fix.label)})` : ""}`)),
  };
}

export function check(args: CliArgs): CommandResult {
  const base = one(args, "--base");
  if (base === undefined) return usage("check needs --base <ref>");
  const failOn = (one(args, "--fail-on") ?? "").split(",").filter((entry) => entry !== "");
  if (!failOn.every((entry) => (FAIL_ON as readonly string[]).includes(entry))) return usage(`--fail-on takes ${FAIL_ON.join(", ")}`);
  const head = one(args, "--head");
  const map = one(args, "--map");
  const outcome = runCheck({ root: args.root, base, ...(head === undefined ? {} : { head }), ...(map === undefined ? {} : { map }), ...(failOn.length > 0 ? { failOn: failOn as FailOn[] } : {}) });
  if (!outcome.ok) return usage(outcome.reason);
  return { exitCode: outcome.report.result === "pass" ? 0 : 1, json: outcome.report, markdown: deltaMarkdown(outcome.report, outcome.report) };
}

/** Reads a run folder's JSON sidecar, or `undefined` when it is absent or unreadable. */
function sidecar(dir: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, name), "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * CLD-09: uploads a map and its sidecars to Sustain Cloud, signed with SUSTAIN_TOKEN. The upload is
 * checked (schema, secret scan) before anything is sent; `--dry-run` prints it and sends nothing.
 */
export async function publish(args: CliArgs): Promise<CommandResult> {
  const run = one(args, "--run");
  const mapArgs: CliArgs = run === undefined ? args : { ...args, options: new Map([...args.options, ["--map", [run]]]) };
  const map = chosenMap(mapArgs);
  if (typeof map === "string") return usage(map);
  const git = collectGitFacts(args.root, args.env);
  const repo = git?.origin ? githubSlug(git.origin) : null;
  if (!git || repo === null) return usage("publish needs a git repository with a github.com origin.");
  const branch = currentBranch(args.root, args.env);
  if (branch === null) return usage("publish needs a checked-out branch.");
  const payload = mapPayload({
    repo,
    commit: git.head,
    branch,
    run: map.run,
    map: map.doc,
    record: readRunRecord(map.dir),
    sidecars: { run: sidecar(map.dir, "run.json"), fingerprints: sidecar(map.dir, "fingerprints.json"), evidence: sidecar(map.dir, "evidence.json") },
  });
  const issues = checkUpload(payload);
  if (issues.length > 0) {
    return { exitCode: 1, json: { status: "refused", message: "The upload would be refused, so nothing was sent.", issues }, markdown: list("Not sent", issues.map((issue) => `${escapeMarkdown(issue.pointer)}: ${escapeMarkdown(issue.message)}`)) };
  }
  const cloud = one(args, "--url") ?? args.env["SUSTAIN_CLOUD_URL"];
  if (args.options.has("--dry-run")) return { exitCode: 0, json: { status: "dry-run", url: cloud ?? null, payload }, markdown: `Would send to ${cloud ?? "(no --url)"}:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n` };
  const token = args.env["SUSTAIN_TOKEN"];
  if (!cloud) return usage("publish needs --url or SUSTAIN_CLOUD_URL.");
  if (!token) return usage("publish needs an upload token in SUSTAIN_TOKEN, from the repository's settings in Sustain Cloud.");
  let result;
  try {
    result = await postUpload(cloud, token, payload);
  } catch (error) {
    return usage(`cannot reach ${cloud}: ${(error as Error).message}`);
  }
  if (!result.ok) return { exitCode: 1, json: { status: "rejected", httpStatus: result.status, response: result.body }, markdown: `Rejected: ${escapeMarkdown(result.message)}\n` };
  return { exitCode: 0, json: { status: "published", response: result.body }, markdown: `Published ${escapeMarkdown(map.run)}.\n` };
}

/** The CLI's home, from the file the CLI was loaded from. */
export function cliHome(cliFile: string, page: { script: string; style: string }): CliHome {
  const dist = dirname(dirname(cliFile));
  return { skills: join(dist, "skills"), hashes: join(dist, "skill-hashes.json"), page };
}
