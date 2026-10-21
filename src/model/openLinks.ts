// RCH-01: the links the diagram page builds to open a cited line in an editor, on GitHub, or as
// text to copy. Every path passes the citation path rule and the deny-list first. Browser-safe.
import { citationPathOk } from "./citationPath";
import { isDenied } from "./deny";
import type { Repository } from "./types";

export type OpenTarget = "vscode" | "cursor" | "jetbrains" | "github" | "copy";

export const TARGET_LABELS: Readonly<Record<OpenTarget, string>> = {
  vscode: "VS Code",
  cursor: "Cursor",
  jetbrains: "JetBrains",
  github: "GitHub",
  copy: "Copy path:line",
};

/** What the page knows about where the code lives. */
export interface LinkContext {
  /** The repository's absolute path, only in a page made for this machine. */
  root: string | null;
  /** The repository folder's name, for JetBrains. */
  project: string | null;
  repository: Repository | null;
}

export interface CitedLines {
  path: string;
  line?: number;
  end_line?: number;
}

/** Whether a page may build a link to `path`. */
export function linkablePath(path: string): boolean {
  return citationPathOk(path) && !isDenied(path);
}

/** `root` and `path` joined with `/`, with a Windows drive written `c:/…`. */
function absolute(root: string, path: string): string {
  const base = root.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${base}/${path}`;
}

/** An absolute path inside a URL: each segment percent-encoded, the separators and a drive colon kept. */
function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment, index) => (index === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join("/");
}

/** `owner/repo` of a github.com URL, or `null`. */
function githubRepo(url: string): string | null {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(url);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** The targets a page can offer with this context, in menu order. */
export function availableTargets(context: LinkContext): OpenTarget[] {
  const targets: OpenTarget[] = [];
  if (context.root !== null) targets.push("vscode", "cursor");
  if (context.root !== null || context.project !== null) targets.push("jetbrains");
  if (context.repository?.provider === "github" && githubRepo(context.repository.url) !== null) targets.push("github");
  targets.push("copy");
  return targets;
}

/** The link or text for `cited` in `target`, or `null` when the target cannot reach it. */
export function openLink(target: OpenTarget, cited: CitedLines, context: LinkContext): string | null {
  if (!linkablePath(cited.path)) return null;
  const line = cited.line ?? 1;
  switch (target) {
    case "vscode":
    case "cursor":
      return context.root === null ? null : `${target}://file/${encodePath(absolute(context.root, cited.path))}:${line}:1`;
    case "jetbrains":
      if (context.project !== null) return `jetbrains://idea/navigate/reference?project=${encodeURIComponent(context.project)}&path=${encodeURIComponent(`${cited.path}:${line}`)}`;
      return context.root === null ? null : `idea://open?file=${encodeURIComponent(absolute(context.root, cited.path))}&line=${line}`;
    case "github": {
      const repo = context.repository?.provider === "github" ? githubRepo(context.repository.url) : null;
      if (repo === null || !/^[0-9a-f]{7,64}$/i.test(context.repository!.revision)) return null;
      const lines = cited.line === undefined ? "" : cited.end_line !== undefined && cited.end_line > cited.line ? `#L${cited.line}-L${cited.end_line}` : `#L${cited.line}`;
      return `https://github.com/${repo}/blob/${context.repository!.revision}/${encodePath(cited.path)}${lines}`;
    }
    case "copy":
      return cited.line === undefined ? cited.path : cited.end_line !== undefined && cited.end_line > cited.line ? `${cited.path}:${cited.line}-${cited.end_line}` : `${cited.path}:${cited.line}`;
  }
}
