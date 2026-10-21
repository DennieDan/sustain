// A file change shown as a diff, then written only once confirmed (PRC-02, ARC-02, ARC-04).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { CONFIG_FILE, readConfig, type SustainConfig } from "../core-node/config";
import { assertWritable } from "../core-node/confine";
import { onAction } from "./notify";

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
  /** Asks in a modal whether to write, and says whether the user agreed. */
  confirm: () => Thenable<boolean>;
}

/** Shows the change as a diff, asks through `confirm`, and writes `after` once confirmed. Returns whether it wrote. */
export async function confirmWrite(request: WriteRequest): Promise<boolean> {
  const key = `/${Date.now()}-${texts.size}`;
  texts.set(`${key}/before`, request.before);
  texts.set(`${key}/after`, request.after);
  await vscode.commands.executeCommand("vscode.diff", vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: `${key}/before` }), vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: `${key}/after` }), request.title);
  if (!(await request.confirm())) return false;
  assertWritable(request.root, request.path);
  writeFileSync(request.path, request.after);
  return true;
}

/** Opens the config in the editor, for the errors about it. */
function openConfig(path: string): Thenable<unknown> {
  return vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path));
}

/** `root`'s config with its text, `{}` without a file, or why it cannot be changed (shown to the user). */
export function configFile(root: string): { ok: true; path: string; text: string; config: SustainConfig } | { ok: false } {
  const path = join(root, CONFIG_FILE);
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, path, text: "", config: {} };
    onAction(vscode.window.showErrorMessage(`Cannot read ${CONFIG_FILE}: ${(error as Error).message}`, "Open Config"), "Open Config", () => openConfig(path));
    return { ok: false };
  }
  try {
    const read = readConfig(JSON.parse(text));
    if (read.ok) return { ok: true, path, text, config: read.config };
    onAction(vscode.window.showErrorMessage(`${CONFIG_FILE}: ${read.errors.join("; ")}`, "Open Config"), "Open Config", () => openConfig(path));
  } catch (error) {
    onAction(vscode.window.showErrorMessage(`${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`, "Open Config"), "Open Config", () => openConfig(path));
  }
  return { ok: false };
}

/** A config as the file holds it. */
export function configText(config: SustainConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
