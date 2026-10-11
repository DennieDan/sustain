// Replaces `vscode.window` UI calls for one test. The suite runs inside the extension's own
// host, so it shares the `vscode` API object the extension calls.
import * as vscode from "vscode";

type Window = typeof vscode.window;

export interface MessageCall {
  message: string;
  /** Everything after the message: options object and/or button labels. */
  rest: unknown[];
}

export interface UiStubs {
  infos: MessageCall[];
  warnings: MessageCall[];
  errors: MessageCall[];
  quickPicks: unknown[][];
  inputBoxes: (vscode.InputBoxOptions | undefined)[];
  /** Answers for the next calls, consumed in order; `undefined` = dismissed. */
  answers: {
    info: (string | undefined)[];
    warning: (string | undefined)[];
    /** Picks the item whose `label` matches, or dismisses for `undefined`. */
    quickPick: (string | undefined)[];
    inputBox: (string | undefined)[];
  };
  restore(): void;
}

export function stubUi(): UiStubs {
  const window = vscode.window as { -readonly [K in keyof Window]: Window[K] };
  const saved = {
    showInformationMessage: window.showInformationMessage,
    showWarningMessage: window.showWarningMessage,
    showErrorMessage: window.showErrorMessage,
    showQuickPick: window.showQuickPick,
    showInputBox: window.showInputBox,
  };
  const stubs: UiStubs = {
    infos: [],
    warnings: [],
    errors: [],
    quickPicks: [],
    inputBoxes: [],
    answers: { info: [], warning: [], quickPick: [], inputBox: [] },
    restore: () => Object.assign(window, saved),
  };
  // The real signatures are heavily overloaded; these replacements honour the shapes the
  // extension uses (message + optional options + string buttons, item arrays).
  Object.assign(window, {
    showInformationMessage: (message: string, ...rest: unknown[]) => {
      stubs.infos.push({ message, rest });
      return Promise.resolve(stubs.answers.info.shift());
    },
    showWarningMessage: (message: string, ...rest: unknown[]) => {
      stubs.warnings.push({ message, rest });
      return Promise.resolve(stubs.answers.warning.shift());
    },
    showErrorMessage: (message: string, ...rest: unknown[]) => {
      stubs.errors.push({ message, rest });
      return Promise.resolve(undefined);
    },
    showQuickPick: async (items: readonly vscode.QuickPickItem[] | Thenable<readonly vscode.QuickPickItem[]>) => {
      const resolved = await items;
      stubs.quickPicks.push([...resolved]);
      const label = stubs.answers.quickPick.shift();
      return label === undefined ? undefined : resolved.find((item) => item.label === label);
    },
    showInputBox: (options?: vscode.InputBoxOptions) => {
      stubs.inputBoxes.push(options);
      return Promise.resolve(stubs.answers.inputBox.shift());
    },
  });
  return stubs;
}
