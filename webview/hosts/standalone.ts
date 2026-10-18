// VWR-01: the viewer outside VS Code, in the diagram page (RCH-01) and the cloud site. Tokens come
// from a light and a dark palette that follow the system setting.
import type { HostMessage, WebviewMessage } from "../../src/model/messages";
import { applyTokens, type Host } from "../bridge";

const SHARED: Readonly<Record<string, string>> = {
  "--sustain-font-family": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  "--sustain-font-size": "13px",
  "--sustain-mono-font-family": 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

export const LIGHT: Readonly<Record<string, string>> = {
  ...SHARED,
  "--sustain-background": "#ffffff",
  "--sustain-foreground": "#1f2328",
  "--sustain-muted": "#59636e",
  "--sustain-accent": "#0969da",
  "--sustain-blue": "#0969da",
  "--sustain-green": "#1a7f37",
  "--sustain-purple": "#8250df",
  "--sustain-yellow": "#9a6700",
  "--sustain-red": "#cf222e",
  "--sustain-orange": "#bc4c00",
  "--sustain-shadow": "rgba(31, 35, 40, 0.15)",
  "--sustain-border": "#d1d9e0",
  "--sustain-hover": "rgba(129, 139, 152, 0.15)",
  "--sustain-active": "rgba(129, 139, 152, 0.25)",
  "--sustain-widget-background": "#f6f8fa",
  "--sustain-widget-border": "#d1d9e0",
  "--sustain-tooltip-background": "#ffffff",
  "--sustain-tooltip-foreground": "#1f2328",
  "--sustain-tooltip-border": "#d1d9e0",
  "--sustain-link": "#0969da",
  "--sustain-link-active": "#0550ae",
  "--sustain-toggle-background": "#ddf4ff",
  "--sustain-toggle-foreground": "#0969da",
  "--sustain-button-background": "#1f883d",
  "--sustain-button-foreground": "#ffffff",
  "--sustain-button-hover": "#1a7f37",
};

export const DARK: Readonly<Record<string, string>> = {
  ...SHARED,
  "--sustain-background": "#0d1117",
  "--sustain-foreground": "#e6edf3",
  "--sustain-muted": "#9198a1",
  "--sustain-accent": "#4493f8",
  "--sustain-blue": "#4493f8",
  "--sustain-green": "#3fb950",
  "--sustain-purple": "#ab7df8",
  "--sustain-yellow": "#d29922",
  "--sustain-red": "#f85149",
  "--sustain-orange": "#db6d28",
  "--sustain-shadow": "rgba(1, 4, 9, 0.6)",
  "--sustain-border": "#3d444d",
  "--sustain-hover": "rgba(101, 108, 118, 0.2)",
  "--sustain-active": "rgba(101, 108, 118, 0.3)",
  "--sustain-widget-background": "#151b23",
  "--sustain-widget-border": "#3d444d",
  "--sustain-tooltip-background": "#151b23",
  "--sustain-tooltip-foreground": "#e6edf3",
  "--sustain-tooltip-border": "#3d444d",
  "--sustain-link": "#4493f8",
  "--sustain-link-active": "#79c0ff",
  "--sustain-toggle-background": "#121d2f",
  "--sustain-toggle-foreground": "#4493f8",
  "--sustain-button-background": "#238636",
  "--sustain-button-foreground": "#ffffff",
  "--sustain-button-hover": "#2ea043",
};

export interface StandaloneOptions {
  /** What the viewer's requests do outside VS Code, such as opening a source. */
  post(message: WebviewMessage): void;
  /** Messages delivered once the viewer listens, such as the embedded diagram. */
  messages: HostMessage[];
}

export function standaloneHost(options: StandaloneOptions): Host {
  const dark = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const apply = (): void => applyTokens(document.body, dark?.matches === true ? DARK : LIGHT);
  apply();
  dark?.addEventListener("change", apply);
  return {
    post: options.post,
    listen: (handler) => {
      for (const message of options.messages) queueMicrotask(() => handler(message));
    },
  };
}
