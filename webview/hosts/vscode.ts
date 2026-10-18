// VWR-01: the viewer inside a VS Code webview. Tokens follow the editor's theme variables, and
// messages go through the webview API.
import type { WebviewMessage } from "../../src/model/messages";
import { applyTokens, type Host } from "../bridge";

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

/** Each `--sustain-*` token as the VS Code theme variable it follows. */
export const VSCODE_TOKENS: Readonly<Record<string, string>> = {
  "--sustain-background": "var(--vscode-editor-background)",
  "--sustain-foreground": "var(--vscode-foreground)",
  "--sustain-muted": "var(--vscode-descriptionForeground)",
  "--sustain-accent": "var(--vscode-focusBorder)",
  "--sustain-font-size": "var(--vscode-font-size)",
  "--sustain-mono-font-family": "var(--vscode-editor-font-family)",
  "--sustain-blue": "var(--vscode-charts-blue)",
  "--sustain-green": "var(--vscode-charts-green)",
  "--sustain-purple": "var(--vscode-charts-purple)",
  "--sustain-yellow": "var(--vscode-charts-yellow)",
  "--sustain-red": "var(--vscode-charts-red)",
  "--sustain-orange": "var(--vscode-charts-orange)",
  "--sustain-shadow": "var(--vscode-widget-shadow)",
  "--sustain-border": "var(--vscode-panel-border)",
  "--sustain-hover": "var(--vscode-toolbar-hoverBackground)",
  "--sustain-active": "var(--vscode-toolbar-activeBackground, var(--vscode-toolbar-hoverBackground))",
  "--sustain-widget-background": "var(--vscode-editorWidget-background)",
  "--sustain-widget-border": "var(--vscode-editorWidget-border, var(--vscode-panel-border))",
  "--sustain-tooltip-background": "var(--vscode-editorHoverWidget-background)",
  "--sustain-tooltip-foreground": "var(--vscode-editorHoverWidget-foreground)",
  "--sustain-tooltip-border": "var(--vscode-editorHoverWidget-border)",
  "--sustain-link": "var(--vscode-textLink-foreground)",
  "--sustain-link-active": "var(--vscode-textLink-activeForeground)",
  "--sustain-toggle-background": "var(--vscode-inputOption-activeBackground, var(--vscode-toolbar-hoverBackground))",
  "--sustain-toggle-foreground": "var(--vscode-inputOption-activeForeground, var(--vscode-foreground))",
  "--sustain-button-background": "var(--vscode-button-background)",
  "--sustain-button-foreground": "var(--vscode-button-foreground)",
  "--sustain-button-hover": "var(--vscode-button-hoverBackground)",
};

export function vscodeHost(): Host {
  const api = acquireVsCodeApi();
  applyTokens(document.body, VSCODE_TOKENS);
  // Text is measured on a canvas, which needs the family itself rather than a variable.
  const family = getComputedStyle(document.body).getPropertyValue("--vscode-font-family").trim();
  document.body.style.setProperty("--sustain-font-family", family || "sans-serif");
  return {
    post: (message) => api.postMessage(message),
    listen: (handler) => window.addEventListener("message", (event) => handler(event.data)),
  };
}
