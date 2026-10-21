// ARC-04: `Sustain: Write Architecture Notes for Agents`. Merges the notes block into AGENTS.md, and
// into CLAUDE.md when it does not import AGENTS.md, each after its diff and a yes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { claudeNeedsNotes, mergeNotes, notesBlock } from "../model/agentNotes";
import { loadConfig } from "../core-node/check";
import { readRules } from "../core-node/rules";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "../core-node/runFolder";
import { readDiagram } from "../core/tolerant";
import { pickRepoRoot } from "./folders";
import { confirmWrite } from "./previewWrite";
import { rulesMap } from "./rules";

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export async function writeAgentNotesCommand(): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const root = folder.uri.fsPath;
  const { map } = rulesMap(root);
  const read = map === null ? null : readDiagram(JSON.parse(readText(join(root, ARCHIFY_DIR, map, CANDIDATE_FILE)) ?? "null"));
  if (map === null || read === null || !read.ok) {
    void vscode.window.showInformationMessage("The notes come from the main map. Generate a map with an empty focus first.");
    return;
  }
  const config = loadConfig(root);
  const block = notesBlock({ run: map, components: read.diagram.components, connections: read.diagram.connections }, config.ok ? readRules(config.config.rules ?? []).rules : []);
  const targets = ["AGENTS.md"];
  const claude = readText(join(root, "CLAUDE.md"));
  if (claude !== null && claudeNeedsNotes(claude)) targets.push("CLAUDE.md");
  let changed = 0;
  for (const name of targets) {
    const path = join(root, name);
    const before = readText(path) ?? "";
    const after = mergeNotes(before, block);
    if (after === before) continue;
    changed++;
    const written = await confirmWrite({
      root,
      path,
      before,
      after,
      title: `${name}: architecture notes`,
      confirm: async () =>
        (await vscode.window.showWarningMessage(`Write the architecture notes into ${name}?`, { modal: true, detail: "Sustain changes only the block between its markers. Your own text stays as it is." }, "Write")) === "Write",
    });
    if (!written) return;
  }
  if (changed === 0) void vscode.window.showInformationMessage("The architecture notes for agents are up to date.");
}
