// VWR-05: "Map This Box in Detail" in a box's menu runs Generate focused on the box, and the new map
// records the map it came from, so it can offer "Back to overview".
import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { confirmAndLaunch, type LaunchTask } from "./generate";
import { ArchitecturePanel } from "./panel";
import type { Runs } from "./runs";

/** Generate focused on box `label` of the map in run folder `parent`. */
export function drillTask(label: string, parent: string): LaunchTask {
  return { skill: "sustain-architecture", args: `${label.trim()} --parent ${parent}`, title: `${label.trim()} in detail` };
}

/** Runs Generate on the box of the shown map that the box menu names. */
export async function drillDownCommand(context: vscode.ExtensionContext, runs: Runs, box?: { componentId?: unknown }): Promise<void> {
  const panel = ArchitecturePanel.current;
  const component = panel?.components().find((entry) => entry.id === box?.componentId);
  if (!panel || !component || panel.file === "") return;
  await confirmAndLaunch(context, runs, panel.root, drillTask(component.label, basename(dirname(panel.file))));
}
