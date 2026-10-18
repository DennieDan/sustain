// CST-01: how big a repository is, for the token estimate (CST-02) and the skill's read budget
// (CST-05). Files come from `git ls-files`, or a walk when git cannot list them. Lines are counted
// per language and split into test and non-test code; non-test lines set the tier. Generated files
// are left out: lock files, minified files, and what `.gitattributes` marks for GitHub's statistics.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDenied } from "./deny";
import type { SizeFacts } from "./estimate";
import { generatedFiles, trackedFiles } from "./git";

export type Tier = "S" | "M" | "L";

export interface LanguageSize {
  language: string;
  files: number;
  lines: number;
  testLines: number;
}

export interface RepoSize {
  listing: "git" | "walk";
  /** Text files measured. */
  files: number;
  /** Files whose lines were counted; the others' lines are estimated from the counted ones. */
  counted: number;
  lines: { total: number; test: number; nonTest: number };
  /** Largest first. */
  languages: LanguageSize[];
  tier: Tier;
}

/** Folders neither listing measures. */
export const SKIPPED_DIRS = [".git", "node_modules", "vendor", "dist", "build", "target", "out", ".sustain"];
/** Most files counted line by line; larger repositories are sampled (see {@link repoSize}). */
export const COUNT_LIMIT = 2000;
/** Larger files are generated or data, and are left out. */
export const MAX_FILE_BYTES = 1024 * 1024;
/** Non-test lines at which a repository becomes M, and L. */
export const TIER_BOUNDS = { M: 20_000, L: 150_000 } as const;
/** Reads and searches the architecture skill keeps to, per tier (CST-05). */
export const READ_BUDGET: Record<Tier, number> = { S: 25, M: 45, L: 70 };

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala", groovy: "Groovy", gradle: "Gradle",
  go: "Go", rs: "Rust", rb: "Ruby", php: "PHP", cs: "C#", fs: "F#", swift: "Swift", dart: "Dart",
  c: "C", h: "C", cc: "C++", cpp: "C++", cxx: "C++", hpp: "C++", hh: "C++", m: "Objective-C", mm: "Objective-C",
  ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", clj: "Clojure", lua: "Lua", r: "R", jl: "Julia",
  sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell", sql: "SQL",
  html: "HTML", htm: "HTML", css: "CSS", scss: "CSS", sass: "CSS", less: "CSS", vue: "Vue", svelte: "Svelte",
  md: "Markdown", mdx: "Markdown", rst: "reStructuredText", adoc: "AsciiDoc",
  json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML", xml: "XML", proto: "Protocol Buffers", graphql: "GraphQL", tf: "Terraform",
};
const NAMED: Record<string, string> = { dockerfile: "Dockerfile", makefile: "Makefile", gemfile: "Ruby", rakefile: "Ruby" };
const BINARY = new Set(
  ("png jpg jpeg gif bmp ico webp tif tiff psd pdf zip gz tgz bz2 xz 7z rar jar war ear class o a so dylib dll exe bin " +
    "wasm woff woff2 ttf otf eot mp3 mp4 m4a mov avi mkv webm wav flac ogg sqlite db pyc pyo vsix lockb").split(" "),
);
/** Generated files an agent does not read for architecture. */
const GENERATED = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(js|css)$|\.map$/;
const TEST_DIRS = new Set(["test", "tests", "__tests__", "spec", "specs", "e2e", "testdata", "fixtures"]);
const TEST_FILES = /(\.|_)(test|spec)\.[^./]+$|^test_[^/]+\.py$|(Test|Tests|IT)\.(java|kt|scala)$|_spec\.rb$/;

/** The language of `path`, `"Other"` for text without a known one, or `null` for binaries and generated files. */
export function languageOf(path: string): string | null {
  if (GENERATED.test(path)) return null;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const named = NAMED[name.toLowerCase()];
  if (named !== undefined) return named;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (BINARY.has(extension)) return null;
  return LANGUAGES[extension] ?? "Other";
}

/** Whether `path` is test code: in a test folder, or named as a test. */
export function isTestPath(path: string): boolean {
  const segments = path.split("/");
  const name = segments.pop()!;
  return segments.some((segment) => TEST_DIRS.has(segment.toLowerCase())) || TEST_FILES.test(name);
}

/** What an estimate needs from a size (CST-02). */
export function sizeFacts(size: RepoSize): SizeFacts {
  return { nonTestLines: size.lines.nonTest, files: size.files };
}

export function tierOf(nonTestLines: number): Tier {
  return nonTestLines < TIER_BOUNDS.M ? "S" : nonTestLines <= TIER_BOUNDS.L ? "M" : "L";
}

function skipped(path: string): boolean {
  return path.split("/").some((segment) => SKIPPED_DIRS.includes(segment)) || isDenied(path);
}

/** Every file under `root`, skipping links, {@link SKIPPED_DIRS} and deny-listed paths. */
function walk(root: string): string[] {
  const files: string[] = [];
  const pending = [""];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (SKIPPED_DIRS.includes(entry.name) || isDenied(path)) continue;
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort();
}

/**
 * The lines of the regular file at `path`: newlines, plus one for a last line without one. `null`
 * for a link, a missing file, binary content or a file above {@link MAX_FILE_BYTES}.
 */
function countFile(path: string): number | null {
  let data: Buffer;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    data = readFileSync(path);
  } catch {
    return null;
  }
  if (data.subarray(0, 8000).includes(0)) return null;
  let lines = 0;
  for (let at = data.indexOf(10); at !== -1; at = data.indexOf(10, at + 1)) lines++;
  return data.length > 0 && data[data.length - 1] !== 10 ? lines + 1 : lines;
}

/**
 * The size of the repository at `root`. Up to `limit` files are counted line by line. In larger
 * repositories `limit` files spread evenly through the sorted list are counted, and each other file
 * is taken to have its language's mean lines per counted file. Only counted files are opened, so
 * the cost grows with the number of files listed, not read.
 */
export function repoSize(root: string, env: NodeJS.ProcessEnv = process.env, limit = COUNT_LIMIT): RepoSize {
  const tracked = trackedFiles(root, env);
  const kept = tracked === null ? walk(root) : tracked.filter((path) => !skipped(path)).sort();
  const generated = tracked === null ? new Set<string>() : generatedFiles(root, kept, env);
  const candidates: { path: string; language: string }[] = [];
  for (const path of kept) {
    const language = generated.has(path) ? null : languageOf(path);
    if (language !== null) candidates.push({ path, language });
  }

  const step = Math.max(1, candidates.length / limit);
  const counts = new Map<number, number | null>();
  const means = new Map<string, { files: number; lines: number }>();
  for (let at = 0; at < candidates.length; at += step) {
    const index = Math.floor(at);
    const file = candidates[index]!;
    const count = countFile(join(root, file.path));
    counts.set(index, count);
    if (count === null) continue;
    const seen = means.get(file.language) ?? { files: 0, lines: 0 };
    means.set(file.language, { files: seen.files + 1, lines: seen.lines + count });
  }
  const all = [...means.values()].reduce((sum, entry) => ({ files: sum.files + entry.files, lines: sum.lines + entry.lines }), { files: 0, lines: 0 });
  const meanLines = (language: string): number => {
    const entry = means.get(language) ?? all;
    return entry.files > 0 ? entry.lines / entry.files : 0;
  };

  const languages = new Map<string, LanguageSize>();
  let files = 0;
  let counted = 0;
  for (const [index, file] of candidates.entries()) {
    const known = counts.get(index);
    if (known === null) continue;
    if (known !== undefined) counted++;
    const count = known ?? meanLines(file.language);
    files++;
    const entry = languages.get(file.language) ?? { language: file.language, files: 0, lines: 0, testLines: 0 };
    entry.files++;
    entry.lines += count;
    if (isTestPath(file.path)) entry.testLines += count;
    languages.set(file.language, entry);
  }
  const sorted = [...languages.values()]
    .map((entry) => ({ ...entry, lines: Math.round(entry.lines), testLines: Math.round(entry.testLines) }))
    .sort((a, b) => b.lines - a.lines || a.language.localeCompare(b.language));
  const total = sorted.reduce((sum, entry) => sum + entry.lines, 0);
  const test = sorted.reduce((sum, entry) => sum + entry.testLines, 0);
  return { listing: tracked === null ? "walk" : "git", files, counted, lines: { total, test, nonTest: total - test }, languages: sorted, tier: tierOf(total - test) };
}
