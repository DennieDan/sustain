// SET-04: each error and warning offers one action. The action runs once chosen, and the code that
// showed the notification carries on meanwhile.
import * as vscode from "vscode";

/** Runs `run` once `action` is chosen on the notification `shown`. */
export function onAction(shown: Thenable<string | undefined>, action: string, run: () => unknown): void {
  void shown.then((choice) => (choice === action ? run() : undefined));
}

/** Opens the folder picker, for the errors that need an open folder. */
export function openFolder(): Thenable<unknown> {
  return vscode.commands.executeCommand("workbench.action.files.openFolder");
}
