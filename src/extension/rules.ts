// ARC-01: the architecture rules' violations, in the Problems panel and on the map. Each folder is
// checked when its rules, its map or a source file is saved, a moment after the last save.
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as vscode from "vscode";
import { loadConfig, mainMap } from "../model/check";
import { importLanguage, importRefs } from "../model/evidence/graph";
import { untrackedFiles } from "../model/git";
import { Ownership } from "../model/ownership";
import { isTestPath, listFiles, skipped } from "../model/repoSize";
import { checkRules, readRules, type Violation } from "../model/rules";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "../model/runFolder";
import { fileReader } from "../model/staleness";
import { readDiagram } from "../model/tolerant";

/** Wait after the last save before checking again. */
export const RULES_DEBOUNCE_MS = 300;

const SEVERITY: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

/** A folder's rules checked against its main map. */
export interface RulesResult {
  /** The map whose box ids the rules use, by run folder; `null` without one. */
  map: string | null;
  rules: { id: string; reason: string; violations: number }[];
  violations: Violation[];
}

/** Checks `root`'s rules now (ARC-01). */
export function checkFolderRules(root: string): RulesResult {
  const config = loadConfig(root);
  const rules = config.ok ? readRules(config.config.rules ?? []).rules : [];
  const map = config.ok ? (config.config.map ?? mainMap(root)) : null;
  if (rules.length === 0) return { map, rules: [], violations: [] };
  let components: { id: string; sources: { path: string }[] }[] = [];
  if (map !== null) {
    try {
      const read = readDiagram(JSON.parse(readFileSync(join(root, ARCHIFY_DIR, map, CANDIDATE_FILE), "utf8")));
      if (read.ok) components = read.diagram.components;
    } catch {
      // Without a readable map only path: rule ends match.
    }
  }
  // New files count before they are added to git.
  const listed = new Set([...listFiles(root).files, ...untrackedFiles(root).filter((path) => !skipped(path))]);
  const files = [...listed].filter((path) => importLanguage(path) !== null && !isTestPath(path)).sort();
  const read = fileReader(root);
  const violations = checkRules(rules, components, importRefs(files, (path) => read(path)?.toString("utf8") ?? null));
  return { map, rules: rules.map((rule) => ({ id: rule.id, reason: rule.reason, violations: violations.filter((violation) => violation.rule === rule.id).length })), violations };
}

/** The violations as arrows between the boxes of `components` that own the two files, labelled with the rules. */
export function violationArrows(violations: readonly Violation[], components: readonly { id: string; sources?: readonly { path: string }[] }[]): { from: string; to: string; label: string }[] {
  const ownership = new Ownership(components);
  const arrows = new Map<string, { from: string; to: string; rules: Set<string> }>();
  for (const violation of violations) {
    for (const from of ownership.owners(violation.file)) {
      for (const to of ownership.owners(violation.imported)) {
        if (from === to) continue;
        const key = `${from}\0${to}`;
        const arrow = arrows.get(key) ?? { from, to, rules: new Set<string>() };
        arrow.rules.add(violation.rule);
        arrows.set(key, arrow);
      }
    }
  }
  return [...arrows.values()].map((arrow) => ({ from: arrow.from, to: arrow.to, label: [...arrow.rules].join(", ") }));
}

export class RulesService implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection("sustain-rules");
  private readonly results = new Map<string, RulesResult>();
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private readonly changed = new vscode.EventEmitter<string>();
  private readonly disposables: vscode.Disposable[] = [];

  /** Fires with the folder whose violations were checked again. */
  readonly onDidChange = this.changed.event;

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => this.saved(document.uri)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("sustain.rules.severity")) for (const root of this.results.keys()) this.publish(root);
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.checkAll()),
    );
    for (const pattern of [`sustain.config.json`, `${ARCHIFY_DIR}/*/${CANDIDATE_FILE}`]) {
      const watcher = vscode.workspace.createFileSystemWatcher(`**/${pattern}`);
      for (const event of [watcher.onDidCreate, watcher.onDidChange, watcher.onDidDelete]) event((uri) => this.saved(uri));
      this.disposables.push(watcher);
    }
    this.checkAll();
  }

  /** The last check of `root`, or `null` before the first. */
  result(root: string): RulesResult | null {
    return this.results.get(root) ?? null;
  }

  /** Checks every folder now. */
  checkAll(): void {
    for (const folder of vscode.workspace.workspaceFolders ?? []) this.check(folder.uri.fsPath);
  }

  /** Checks `root` now and publishes its diagnostics. */
  check(root: string): RulesResult {
    let result: RulesResult;
    try {
      result = checkFolderRules(root);
    } catch {
      result = { map: null, rules: [], violations: [] };
    }
    this.results.set(root, result);
    this.publish(root);
    this.changed.fire(root);
    return result;
  }

  private saved(uri: vscode.Uri): void {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined || uri.scheme !== "file") return;
    const rel = relative(folder.uri.fsPath, uri.fsPath).split(sep).join("/");
    if (importLanguage(rel) === null && !rel.endsWith("sustain.config.json") && !rel.endsWith(CANDIDATE_FILE)) return;
    this.pending.add(folder.uri.fsPath);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const roots = [...this.pending];
      this.pending.clear();
      for (const root of roots) this.check(root);
    }, RULES_DEBOUNCE_MS);
  }

  private publish(root: string): void {
    const severity = SEVERITY[vscode.workspace.getConfiguration("sustain").get<string>("rules.severity", "warning")] ?? vscode.DiagnosticSeverity.Warning;
    // Clear this folder's old entries, then set its current ones.
    this.diagnostics.forEach((uri) => {
      if (vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath === root) this.diagnostics.delete(uri);
    });
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const violation of this.results.get(root)?.violations ?? []) {
      const line = Math.max(0, violation.line - 1);
      const diagnostic = new vscode.Diagnostic(new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER), `${violation.rule}: imports ${violation.imported}. ${violation.reason}`, severity);
      diagnostic.source = "Sustain";
      diagnostic.code = violation.rule;
      byFile.set(violation.file, [...(byFile.get(violation.file) ?? []), diagnostic]);
    }
    for (const [file, list] of byFile) this.diagnostics.set(vscode.Uri.file(join(root, ...file.split("/"))), list);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.diagnostics.dispose();
    this.changed.dispose();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
