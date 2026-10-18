// VWR-06: Save Image in the map's title bar writes the shown map as SVG or PNG wherever the save
// dialog says. The file's extension picks the format.
import { dirname, extname, join } from "node:path";
import * as vscode from "vscode";
import type { ImageFormat } from "../model/messages";
import { ArchitecturePanel } from "./panel";

const PNG_PREFIX = "data:image/png;base64,";

/** The bytes of the map's answer in `format`, or `null` when the answer is something else. */
export function imageBytes(format: ImageFormat, data: string): Uint8Array | null {
  if (format === "png") return data.startsWith(PNG_PREFIX) ? Buffer.from(data.slice(PNG_PREFIX.length), "base64") : null;
  return data.startsWith("<?xml") ? Buffer.from(data, "utf8") : null;
}

export async function saveImageCommand(): Promise<void> {
  const panel = ArchitecturePanel.current;
  if (panel === undefined || panel.file === "") {
    void vscode.window.showInformationMessage("Open a map first. Save Image writes the shown map as a picture.");
    return;
  }
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(join(dirname(panel.file), "map.svg")),
    filters: { "SVG image": ["svg"], "PNG image": ["png"] },
    saveLabel: "Save Image",
    title: "Save the map as an image",
  });
  if (target === undefined) return;
  const format: ImageFormat = extname(target.fsPath).toLowerCase() === ".png" ? "png" : "svg";
  const data = await panel.image(format);
  const bytes = data === null ? null : imageBytes(format, data);
  let problem = bytes === null ? "The map did not draw itself as an image." : null;
  if (bytes !== null) {
    try {
      await vscode.workspace.fs.writeFile(target, bytes);
    } catch (error) {
      problem = `Could not write ${vscode.workspace.asRelativePath(target)}: ${(error as Error).message}`;
    }
  }
  if (problem !== null) {
    if ((await vscode.window.showErrorMessage(problem, "Try Again")) === "Try Again") await saveImageCommand();
    return;
  }
  const choice = await vscode.window.showInformationMessage(`Saved the map image: ${vscode.workspace.asRelativePath(target)}`, "Open");
  if (choice === "Open") await vscode.commands.executeCommand("vscode.open", target);
}
