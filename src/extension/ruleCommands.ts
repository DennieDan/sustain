// ARC-02: rules written from the map and the sidebar. Every rule asks why it exists, and every config
// write shows its diff and waits for a yes.
import * as vscode from "vscode";
import { CONFIG_FILE } from "../model/config";
import { importLinks } from "../model/evidence/graph";
import { forbidRule, onlyFromRule, suggestRules, throughRule, withRules } from "../model/ruleEdits";
import { readRules, type Rule } from "../model/rules";
import { configFile, configText, confirmWrite } from "./previewWrite";
import { ruleSourceFiles, rulesMap, textReader, type RulesService } from "./rules";

/** Shows `rules` added to the config as a diff, and saves them on "Add". Returns whether it saved. */
export async function addRules(service: RulesService, root: string, rules: readonly Rule[], what: string): Promise<boolean> {
  const file = configFile(root);
  if (!file.ok) return false;
  const written = await confirmWrite({
    root,
    path: file.path,
    before: file.text,
    after: configText(withRules(file.config, rules)),
    title: `${CONFIG_FILE}: ${what}`,
    confirm: async () =>
      (await vscode.window.showWarningMessage(`Add ${rules.length === 1 ? "this rule" : `${rules.length} rules`} to ${CONFIG_FILE}?`, { modal: true, detail: rules.map((rule) => `${rule.id}: ${rule.reason}`).join("\n") }, "Add")) === "Add",
  });
  if (written) service.check(root);
  return written;
}

/** The rules map's boxes, or null with a hint when the folder has no main map. */
function rulesBoxes(root: string): { id: string; label: string }[] | null {
  const { map, components } = rulesMap(root);
  if (map === null) {
    void vscode.window.showInformationMessage("Rules use the main map's boxes. Generate a map with an empty focus first.");
    return null;
  }
  return components.map(({ id, label }) => ({ id, label }));
}

async function pickBox(boxes: readonly { id: string; label: string }[], placeHolder: string): Promise<{ id: string; label: string } | undefined> {
  return await vscode.window.showQuickPick(boxes.map((entry) => ({ label: entry.label, id: entry.id })), { placeHolder });
}

async function reason(suggested: string): Promise<string | undefined> {
  const text = await vscode.window.showInputBox({ prompt: "Why does this rule exist? It shows beside every import that breaks it.", value: suggested });
  return text === undefined || text.trim() === "" ? undefined : text.trim();
}

/** The arrow menu's "Forbid this dependency"; from the palette it asks for both ends. */
export async function forbidArrowCommand(service: RulesService, root: string | null, arrow?: { from?: unknown; to?: unknown }): Promise<void> {
  if (root === null) return;
  const boxes = rulesBoxes(root);
  if (boxes === null) return;
  const from = boxes.find((entry) => entry.id === arrow?.from) ?? (await pickBox(boxes, "Which box must not import?"));
  if (from === undefined) return;
  const to = boxes.find((entry) => entry.id === arrow?.to) ?? (await pickBox(boxes, `Which box must ${from.label} not import?`));
  if (to === undefined) return;
  const why = await reason(`${from.label} should not import ${to.label}.`);
  if (why !== undefined) await addRules(service, root, [forbidRule(from.id, to.id, why)], `forbid ${from.label} to ${to.label}`);
}

/** The box menu's "Only Allow Imports From…"; from the palette it asks for the box. */
export async function onlyAllowFromCommand(service: RulesService, root: string | null, box?: { componentId?: unknown }): Promise<void> {
  if (root === null) return;
  const boxes = rulesBoxes(root);
  if (boxes === null) return;
  const target = boxes.find((entry) => entry.id === box?.componentId) ?? (await pickBox(boxes, "Which box restricts who may import it?"));
  if (target === undefined) return;
  const picked = await vscode.window.showQuickPick(
    boxes.filter((entry) => entry.id !== target.id).map((entry) => ({ label: entry.label, id: entry.id })),
    { canPickMany: true, placeHolder: `Which boxes may import ${target.label}?` },
  );
  if (picked === undefined || picked.length === 0) return;
  const why = await reason(`Only ${picked.map((entry) => entry.label).join(", ")} may use ${target.label}.`);
  if (why !== undefined) await addRules(service, root, [onlyFromRule(target.id, picked.map((entry) => entry.id), why)], `only ${picked.map((entry) => entry.label).join(", ")} import ${target.label}`);
}

/** The box menu's "Route Dependencies Through…"; from the palette it asks for the box. */
export async function routeThroughCommand(service: RulesService, root: string | null, box?: { componentId?: unknown }): Promise<void> {
  if (root === null) return;
  const boxes = rulesBoxes(root);
  if (boxes === null) return;
  const target = boxes.find((entry) => entry.id === box?.componentId) ?? (await pickBox(boxes, "Which box must be reached through another?"));
  if (target === undefined) return;
  const picked = await vscode.window.showQuickPick(
    boxes.filter((entry) => entry.id !== target.id).map((entry) => ({ label: entry.label, id: entry.id })),
    { placeHolder: `Which box must imports of ${target.label} go through?` },
  );
  if (picked === undefined) return;
  const why = await reason(`Code reaches ${target.label} only through ${picked.label}.`);
  if (why !== undefined) await addRules(service, root, [throughRule(target.id, picked.id, why)], `${target.label} through ${picked.label}`);
}

/** "Suggest Rules": forbid both ways between boxes whose code shares no import. */
export async function suggestRulesCommand(service: RulesService, root: string | null): Promise<void> {
  if (root === null) return;
  const { map, components } = rulesMap(root);
  if (map === null) {
    void vscode.window.showInformationMessage("Suggest Rules needs a main map. Generate a map with an empty focus first.");
    return;
  }
  const file = configFile(root);
  if (!file.ok) return;
  const existing = readRules(file.config.rules ?? []).rules;
  const suggestions = suggestRules(components, importLinks(ruleSourceFiles(root), textReader(root)), existing);
  if (suggestions.length === 0) {
    void vscode.window.showInformationMessage("Every pair of boxes with code already shares an import, or has a rule.");
    return;
  }
  await addRules(service, root, suggestions, "suggested rules");
}
