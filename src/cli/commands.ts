// RCH-03: the core CLI's commands. Each returns one JSON-able result, its markdown, and an exit
// code with the validator's meaning: 0 done or passed, 1 a finding that fails, 2 a usage or I/O
// error. The extension and the Action call the same model modules.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { runCheck } from "../model/check";
import { FAIL_ON, type FailOn } from "../model/config";
import { deltaMarkdown, escapeMarkdown } from "../model/deltaMarkdown";
import { checkSkill, diffSize, type AgentId, type SkillHashes } from "../model/integrity";
import { runPreflight } from "../model/preflight";
import { SKILL_NAMES, skillBase, skillTargets, writeSkill } from "../extension/skillFiles";

export interface CommandResult {
  exitCode: 0 | 1 | 2;
  json: unknown;
  markdown: string;
}

/** Where the CLI found itself: the shipped skills and their hashes sit beside it. */
export interface CliHome {
  skills: string;
  hashes: string;
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

/** The CLI's home, from the file the CLI was loaded from. */
export function cliHome(cliFile: string): CliHome {
  const dist = dirname(dirname(cliFile));
  return { skills: join(dist, "skills"), hashes: join(dist, "skill-hashes.json") };
}
