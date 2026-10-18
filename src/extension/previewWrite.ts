// A file change shown as a diff, then written only once confirmed (PRC-02, ARC-02, ARC-04).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { CONFIG_FILE, readConfig, type SustainConfig } from "../model/config";
import { assertWritable } from "../model/confine";

export const PREVIEW_SCHEME = "sustain-preview";

const texts = new Map<string, string>();

/** The provider the diff's two sides are read from; registered once at activation. */
export function registerPreviews(): vscode.Disposable {
  return vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, { provideTextDocumentContent: (uri) => texts.get(uri.path) ?? "" });
}

export interface WriteRequest {
  root: string;
  /** The file to write, inside `root`. */
  path: string;
  before: string;
  after: string;
  /** The diff editor's title. */
  title: string;
  question: string;
  detail: string;
  /** The button that writes. */
  verb: string;
}

/** Shows the change as a diff, asks in a modal, and writes `after` on `verb`. Returns whether it wrote. */
export async function confirmWrite(request: WriteRequest): Promise<boolean> {
  const key = `/${Date.now()}-${texts.size}`;
  texts.set(`${key}/before`, request.before);
  texts.set(`${key}/after`, request.after);
  await vscode.commands.executeCommand("vscode.diff", vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: `${key}/before` }), vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: `${key}/after` }), request.title);
  const choice = await vscode.window.showWarningMessage(request.question, { modal: true, detail: request.detail }, request.verb);
  if (choice !== request.verb) return false;
  assertWritable(request.root, request.path);
  writeFileSync(request.path, request.after);
  return true;
}

/** `root`'s config with its text, `{}` without a file, or why it cannot be changed (shown to the user). */
export function configFile(root: string): { ok: true; path: string; text: string; config: SustainConfig } | { ok: false } {
  const path = join(root, CONFIG_FILE);
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, path, text: "", config: {} };
    void vscode.window.showErrorMessage(`Cannot read ${CONFIG_FILE}: ${(error as Error).message}`);
    return { ok: false };
  }
  try {
    const read = readConfig(JSON.parse(text));
    if (read.ok) return { ok: true, path, text, config: read.config };
    void vscode.window.showErrorMessage(`${CONFIG_FILE}: ${read.errors.join("; ")}`);
  } catch (error) {
    void vscode.window.showErrorMessage(`${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`);
  }
  return { ok: false };
}

/** A config as the file holds it. */
export function configText(config: SustainConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
