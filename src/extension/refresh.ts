// FRS-06: Refresh from the map's title bar, its freshness header, the maps list and a box's menu,
// and `Sustain: Refresh Architecture`. Each runs the refresh skill on the shown or chosen map,
// through the sidebar or a terminal as Generate does. Without a map, Refresh is Generate.
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import type { ComposerCli } from "../model/messages";
import { repoRootFor } from "../model/discovery";
import { refreshArgs } from "../model/refresh";
import { parseDiagram } from "../model/tolerant";
import { confirmAndLaunch, generateArchitectureCommand, type LaunchTask } from "./generate";
import { ArchitecturePanel } from "./panel";
import type { Runs } from "./runs";

/** The refresh of `candidate`, limited to `paths` when given. */
export function refreshTask(candidate: string, paths: readonly string[] = []): LaunchTask {
  const run = basename(dirname(candidate));
  let title = run;
  try {
    const result = parseDiagram(readFileSync(candidate, "utf8"));
    if (result.ok && result.diagram.title) title = result.diagram.title;
  } catch {
    // An unreadable map is named by its folder.
  }
  const scope = paths.length === 0 ? "" : ` · ${paths.length} file${paths.length === 1 ? "" : "s"}`;
  return { skill: "sustain-refresh", args: refreshArgs(run, paths), title: `Refresh of ${title}${scope}` };
}

/**
 * Refreshes `file`, or the map the panel shows. `preferred` is the sidebar's chosen agent. With
 * no map at all it runs Generate instead.
 */
export async function refreshArchitectureCommand(context: vscode.ExtensionContext, runs: Runs, file?: string, paths: readonly string[] = [], preferred?: ComposerCli): Promise<void> {
  const panel = ArchitecturePanel.current;
  const candidate = file ?? (panel !== undefined && panel.file !== "" ? panel.file : undefined);
  if (candidate === undefined) {
    await generateArchitectureCommand(context, runs);
    return;
  }
  const fallback = panel?.root ?? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(candidate))?.uri.fsPath ?? dirname(candidate);
  await confirmAndLaunch(context, runs, repoRootFor(candidate, fallback), refreshTask(candidate, paths), preferred);
}

/** "Refresh this box": the shown map's refresh, limited to the files the box cites. */
export async function refreshBoxCommand(context: vscode.ExtensionContext, runs: Runs, box?: { componentId?: unknown }): Promise<void> {
  const panel = ArchitecturePanel.current;
  const component = panel?.components().find((entry) => entry.id === box?.componentId);
  if (!panel || !component) return;
  const paths = [...new Set(component.sources.map((source) => source.path))];
  await refreshArchitectureCommand(context, runs, panel.file, paths);
}
