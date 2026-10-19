// Shared helpers for suites that open the architecture viewer (a custom editor on `*.sir`).
import * as vscode from "vscode";

/**
 * Waits for `condition`. Tab state, the file watcher and its 300 ms debounce reach the test
 * asynchronously with no event to await for every case; poll briefly.
 */
export async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 50);
    await promise;
  }
}

/** Every architecture viewer tab of the workbench. */
export function viewerTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === "sustain.architecture");
}

/** The viewer tabs of `file`. */
export function viewerTabsOf(file: string): vscode.Tab[] {
  return viewerTabs().filter((tab) => (tab.input as vscode.TabInputCustom).uri.fsPath === file);
}

/** Waits until a viewer tab of `file` exists and returns it. */
export async function viewerTab(file: string): Promise<vscode.Tab> {
  await until(() => viewerTabsOf(file).length > 0, `a viewer tab of ${file}`);
  return viewerTabsOf(file)[0]!;
}
