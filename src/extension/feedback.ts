// ACC-06: the box menu's "This Box Is Wrong…". The note goes into feedback.json beside the map, and
// the box can be refreshed straight away.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { assertWritable } from "../model/confine";
import { onAction } from "./notify";
import { ArchitecturePanel } from "./panel";
import { refreshBoxCommand } from "./refresh";
import type { Runs } from "./runs";

export const FEEDBACK_FILE = "feedback.json";
/** Longest note. */
export const MAX_NOTE = 500;

export interface FeedbackNote {
  component: string;
  note: string;
  createdAt: string;
}

/** The notes in `runDir`'s feedback.json; none when it is missing or malformed. */
export function readFeedback(runDir: string): FeedbackNote[] {
  try {
    const value = JSON.parse(readFileSync(join(runDir, FEEDBACK_FILE), "utf8")) as { notes?: unknown };
    return Array.isArray(value.notes) ? (value.notes as FeedbackNote[]).filter((note) => typeof note?.component === "string" && typeof note.note === "string") : [];
  } catch {
    return [];
  }
}

/** Adds `note` to the feedback.json beside the map in `runDir`. */
export function addFeedback(root: string, runDir: string, note: FeedbackNote): void {
  const target = join(runDir, FEEDBACK_FILE);
  assertWritable(root, target);
  writeFileSync(target, `${JSON.stringify({ schema: 1, notes: [...readFeedback(runDir), note] }, null, 2)}\n`);
}

/** "This Box Is Wrong…": asks what is wrong, saves it, and offers "Refresh this box". */
export async function flagBoxCommand(context: vscode.ExtensionContext, runs: Runs, box?: { componentId?: unknown }): Promise<void> {
  const panel = ArchitecturePanel.current;
  const component = panel?.components().find((entry) => entry.id === box?.componentId);
  if (!panel || !component || panel.file === "") return;
  const note = await vscode.window.showInputBox({
    prompt: `What is wrong with ${component.label}?`,
    placeHolder: "For example: it also handles refunds, or the cited code is the old client",
    validateInput: (value) => (value.trim().length > MAX_NOTE ? `Keep the note to ${MAX_NOTE} characters.` : null),
  });
  if (note === undefined || note.trim() === "") return;
  try {
    addFeedback(panel.root, dirname(panel.file), { component: component.id, note: note.trim(), createdAt: new Date().toISOString() });
  } catch (error) {
    // Copy Note keeps the typed note for another try.
    onAction(vscode.window.showErrorMessage(`Could not save the note: ${(error as Error).message}`, "Copy Note"), "Copy Note", () => vscode.env.clipboard.writeText(note.trim()));
    return;
  }
  const choice = await vscode.window.showInformationMessage(`Saved your note on ${component.label} in ${FEEDBACK_FILE}.`, "Refresh this box");
  if (choice === "Refresh this box") await refreshBoxCommand(context, runs, { componentId: component.id });
}
