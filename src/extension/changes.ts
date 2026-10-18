// FRS-04: `Sustain: Show Changes on Diagram` and the map's title-bar button. The user picks a
// scope; git's diff marks the boxes it touches on the shown map.
import * as vscode from "vscode";
import { markChanges, parseDiff, rangeOf, type FileChange } from "../model/changes";
import { listCandidates } from "../model/discovery";
import { diffFor, type ChangeScope } from "../model/git";
import { pickRepoRoot } from "./folders";
import { ArchitecturePanel } from "./panel";

const SCOPES: (vscode.QuickPickItem & { scope: ChangeScope["kind"] })[] = [
  { label: "Uncommitted changes", detail: "The working tree and index against HEAD, with untracked files", scope: "uncommitted" },
  { label: "This branch", detail: "Against the merge-base with origin/HEAD, main or master", scope: "branch" },
  { label: "Commit range…", detail: "Two revisions, such as main..HEAD", scope: "range" },
];

export async function showChangesCommand(extensionUri: vscode.Uri): Promise<void> {
  let panel = ArchitecturePanel.current;
  if (panel === undefined || panel.file === "") {
    const folder = await pickRepoRoot();
    if (!folder) return;
    const newest = listCandidates(folder.uri.fsPath)[0];
    if (newest === undefined) {
      void vscode.window.showInformationMessage("Generate a map first. Show Changes marks the boxes on it.");
      return;
    }
    panel = ArchitecturePanel.show(extensionUri, folder.uri.fsPath, newest.file);
  }
  const picked = await vscode.window.showQuickPick(SCOPES, { placeHolder: "Show which changes?" });
  if (!picked) return;
  let scope: ChangeScope;
  if (picked.scope === "range") {
    const range = await vscode.window.showInputBox({
      prompt: "Commit range",
      placeHolder: "main..HEAD",
      validateInput: (value) => (rangeOf(value) === null ? "Two revisions separated by .., such as main..HEAD" : undefined),
    });
    const parsed = range === undefined ? null : rangeOf(range);
    if (parsed === null) return;
    scope = { kind: "range", ...parsed };
  } else {
    scope = { kind: picked.scope };
  }

  const diff = diffFor(panel.root, scope);
  if (!diff.ok) {
    void vscode.window.showErrorMessage(diff.reason);
    return;
  }
  const changes: FileChange[] = [...parseDiff(diff.text), ...diff.untracked.map((path): FileChange => ({ path, oldPath: path, status: "added", hunks: [] }))];
  const components = panel.components();
  panel.showChanges({ scope: picked.label.replace("…", ""), ...markChanges(components, changes) });
}
