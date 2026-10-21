// SAF-01: before a launch, the skill the agent will load must match the copy Sustain ships.
import { lstatSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { assertWritable } from "../core-node/confine";
import { checkSkill, diffSize, type AgentId, type SkillHashes } from "../core-node/integrity";
import { onAction } from "./notify";
import { configuredScope } from "./scope";
import { skillBase, skillTargets, writeSkill } from "../core-node/skillFiles";

const AGENT_LABELS: Record<AgentId, string> = { claude: "Claude Code", codex: "Codex", devin: "Devin" };

function shippedHashes(extensionUri: vscode.Uri): SkillHashes {
  return JSON.parse(readFileSync(join(extensionUri.fsPath, "dist", "skill-hashes.json"), "utf8")) as SkillHashes;
}

/** Removes a skill copy. A link is removed as a link, and a folder only when it lies inside the root. */
function removeCopy(root: string, rel: string): void {
  const path = join(root, ...rel.split("/"));
  if (!lstatSync(path).isSymbolicLink()) assertWritable(root, path);
  rmSync(path, { recursive: true, force: true });
}

/** How the skill `agent` loads from `root` compares with the shipped copy. */
export interface SkillStatus {
  version: string;
  /** Files that differ, or `null` when the skill is not installed. */
  differing: number | null;
  /** Where the agent loads it from, as messages name it. */
  loadedFrom: string;
}

export function skillStatus(extensionUri: vscode.Uri, root: string, agent: AgentId, name: string): SkillStatus {
  const shipped = shippedHashes(extensionUri);
  const expected = shipped.skills[name];
  if (expected === undefined) throw new Error(`Sustain ${shipped.version} ships no ${name} skill`);
  const base = skillBase(configuredScope(), root);
  const check = checkSkill(base, root, agent, name, expected);
  return {
    version: shipped.version,
    differing: check.diff === null ? null : diffSize(check.diff),
    loadedFrom: `${base === root ? "" : "~/"}${check.effective.slice(0, check.effective.lastIndexOf("/") + 1)}`,
  };
}

/** The sentence that states an install or repair before it happens (SET-03), or `null` when none is needed. */
export function skillNote(status: SkillStatus, name: string): string | null {
  if (status.differing === null) return `Installs the ${name} skill in ${status.loadedFrom}.`;
  if (status.differing > 0) return `Repairs the ${name} skill (${status.differing === 1 ? "1 file differs" : `${status.differing} files differ`} from Sustain ${status.version}).`;
  return null;
}

/**
 * Checks skill `name` as `agent` will load it from `root`, and offers the fix. Returns whether
 * the launch may go ahead. A changed or missing skill is reinstalled, after asking unless
 * `ask` is false because the user was already told (SET-03). Other copies that differ only
 * warn for Claude Code, which loads its own folder, and block Codex and Devin until they are
 * removed.
 */
export async function ensureSkillIntact(extensionUri: vscode.Uri, root: string, agent: AgentId, name: string, ask = true): Promise<boolean> {
  const shipped = shippedHashes(extensionUri);
  const expected = shipped.skills[name];
  if (expected === undefined) throw new Error(`Sustain ${shipped.version} ships no ${name} skill`);

  const base = skillBase(configuredScope(), root);
  let check = checkSkill(base, root, agent, name, expected);
  if (check.diff === null || diffSize(check.diff) > 0) {
    const what = check.diff === null ? "not installed" : `${diffSize(check.diff)} files`;
    if (ask) {
      const choice = await vscode.window.showWarningMessage(
        `The ${name} skill differs from the one in Sustain ${shipped.version} (${what}). Reinstall it before running?`,
        { modal: true },
        "Reinstall",
      );
      if (choice !== "Reinstall") return false;
    }
    writeSkill(base, vscode.Uri.joinPath(extensionUri, "dist", "skills", name).fsPath, skillTargets(base, name), name);
    check = checkSkill(base, root, agent, name, expected);
  }

  if (check.differingCopies.length === 0) return true;
  const copies = check.differingCopies.join(", ");
  if (agent === "claude") {
    const loaded = base === root ? check.effective : `~/${check.effective}`;
    const differing = check.differingCopies;
    onAction(vscode.window.showWarningMessage(`Other copies of ${name} differ from Sustain's: ${copies}. Claude Code loads the one in ${loaded}.`, "Remove Copies"), "Remove Copies", () => {
      for (const copy of differing) removeCopy(root, copy);
    });
    return true;
  }
  const choice = await vscode.window.showWarningMessage(
    `Other copies of ${name} differ from Sustain's, and ${AGENT_LABELS[agent]} would load them too: ${copies}. Remove them before running?`,
    { modal: true },
    "Remove",
  );
  if (choice !== "Remove") return false;
  for (const copy of check.differingCopies) removeCopy(root, copy);
  return true;
}
