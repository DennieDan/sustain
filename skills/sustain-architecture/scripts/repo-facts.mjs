// src/agent/repo-facts.ts
import { basename as basename3, join as join6 } from "node:path";

// src/model/git.ts
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

// src/model/which.ts
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join, posix, win32 } from "node:path";
function isExecutableFile(path, platform) {
  try {
    if (!statSync(path).isFile()) return false;
    if (platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function findOnPath(cli, env, platform = process.platform) {
  const pathValue = env["PATH"] ?? env["Path"] ?? "";
  const extensions = platform === "win32" ? ["", ...(env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)] : [""];
  const absolute = platform === "win32" ? win32.isAbsolute : posix.isAbsolute;
  for (const dir of pathValue.split(platform === "win32" ? ";" : delimiter)) {
    if (!absolute(dir)) continue;
    for (const extension of extensions) {
      const candidate = join(dir, cli + extension);
      if (isExecutableFile(candidate, platform)) return candidate;
    }
  }
  return void 0;
}

// src/model/git.ts
var MAX_DIRTY_PATHS = 200;
var GIT_PREFIX = ["-c", "core.fsmonitor=false", "--no-optional-locks"];
var GIT_READS = {
  topLevel: [...GIT_PREFIX, "rev-parse", "--show-toplevel"],
  head: [...GIT_PREFIX, "rev-parse", "--verify", "--quiet", "HEAD"],
  origin: [...GIT_PREFIX, "config", "--get", "remote.origin.url"],
  status: [...GIT_PREFIX, "status", "--porcelain=v1", "-z"],
  /** `+ <base>^{commit}`: exits 0 when the commit is in the object store (FR-UPD-02). */
  commitExists: [...GIT_PREFIX, "cat-file", "-e"],
  /** `+ <base> HEAD`: exits 0 when base is an ancestor of HEAD (FR-UPD-02). */
  isAncestor: [...GIT_PREFIX, "merge-base", "--is-ancestor"],
  /** `+ <base> --`: base against the working tree, paths verbatim (FR-UPD-03). */
  nameStatus: [...GIT_PREFIX, "diff", "--name-status", "-z", "--find-renames", "--no-color", "--no-ext-diff"],
  /** `+ <base> --`: unified diff of base against the working tree (FR-UPD-03). */
  diff: [...GIT_PREFIX, "diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/"],
  /** Untracked, not ignored files, NUL-separated (FR-UPD-03). */
  untracked: [...GIT_PREFIX, "ls-files", "-z", "--others", "--exclude-standard"],
  /** `+ <rev> --`: subject and committer date, NUL-separated (FR-CMP-01). */
  commitInfo: [...GIT_PREFIX, "log", "-1", "--no-color", "--no-show-signature", "--format=%s%x00%cI"]
};
function gitProgram(env = process.env) {
  return findOnPath("git", env);
}
function runRaw(program, root, argv) {
  const result = spawnSync(program, argv, {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}
function run(program, root, argv) {
  return runRaw(program, root, argv)?.toString("utf8") ?? null;
}
function sanitizeOrigin(url) {
  const match = /^(https?):\/\/(.*)$/is.exec(url);
  if (!match) return url;
  const scheme = match[1];
  const rest = match[2];
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd);
  const tail = authorityEnd < 0 ? "" : rest.slice(authorityEnd);
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  return `${scheme}://${host}${tail}`;
}
function parsePorcelainZ(output) {
  const fields = output.split("\0");
  const paths = [];
  for (let i = 0; i < fields.length; i += 1) {
    const record = fields[i];
    if (record.length < 4) continue;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) i += 1;
  }
  return paths;
}
function collectGitFacts(root, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0) return null;
  const top = run(program, root, GIT_READS.topLevel);
  if (top === null) return null;
  try {
    if (realpathSync(top.trim()) !== realpathSync(root)) return null;
  } catch {
    return null;
  }
  const head = run(program, root, GIT_READS.head)?.trim().toLowerCase();
  if (head === void 0 || !/^[0-9a-f]{40}$/.test(head)) return null;
  const origin = run(program, root, GIT_READS.origin)?.trim() ?? "";
  const allDirty = parsePorcelainZ(run(program, root, GIT_READS.status) ?? "").filter((path) => !path.startsWith(".archify/"));
  return {
    head,
    origin: origin === "" ? null : sanitizeOrigin(origin),
    dirtyCount: allDirty.length,
    dirty: allDirty.slice(0, MAX_DIRTY_PATHS)
  };
}
function trackedFiles(root, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0) return null;
  const output = run(program, root, [...GIT_PREFIX, "ls-files", "--stage", "-z"]);
  if (output === null) return null;
  const files = [];
  for (const entry of output.split("\0")) {
    const tab = entry.indexOf("	");
    if (tab > 0 && (entry.startsWith("100644 ") || entry.startsWith("100755 "))) files.push(entry.slice(tab + 1));
  }
  return files;
}
function generatedFiles(root, paths, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0 || paths.length === 0) return /* @__PURE__ */ new Set();
  const result = spawnSync(program, [...GIT_PREFIX, "check-attr", "-z", "--stdin", "linguist-generated", "linguist-vendored"], {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    input: paths.join("\0"),
    stdio: ["pipe", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) return /* @__PURE__ */ new Set();
  const fields = result.stdout.toString("utf8").split("\0");
  const marked = /* @__PURE__ */ new Set();
  for (let i = 0; i + 2 < fields.length; i += 3) if (fields[i + 2] === "set" || fields[i + 2] === "true") marked.add(fields[i]);
  return marked;
}

// src/model/coefficients.json
var coefficients_default = {
  basis: "provisional",
  fittedAt: null,
  runs: 0,
  lines: {
    claude: {
      full: {
        base: 12e4,
        perLine: 1.5,
        perFile: 30,
        low: 0.7,
        high: 1.4
      }
    },
    codex: {
      full: {
        base: 9e4,
        perLine: 1.5,
        perFile: 30,
        low: 0.7,
        high: 1.4
      }
    }
  },
  mix: {
    claude: {
      input: 0.05,
      cacheWrite: 0.1,
      cacheRead: 0.82,
      output: 0.03
    },
    codex: {
      input: 0.15,
      cacheWrite: 0,
      cacheRead: 0.8,
      output: 0.05
    }
  }
};

// src/model/pricing.json
var pricing_default = {
  asOf: "2026-10-18",
  unit: "USD per million tokens",
  defaults: { claude: "claude-opus-5-5", codex: "gpt-5.5" },
  models: [
    { id: "claude-fable-5-1", label: "Claude Fable 5.1", agent: "claude", input: 10, cacheWrite: 12.5, cacheRead: 0.25, output: 50, source: "https://platform.claude.com/docs/en/about-claude/pricing" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", agent: "claude", input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20, source: "https://platform.claude.com/docs/en/about-claude/pricing" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", agent: "claude", input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10, source: "https://platform.claude.com/docs/en/about-claude/pricing" },
    { id: "gpt-5.5", label: "GPT-5.5", agent: "codex", input: 5, cacheWrite: 0, cacheRead: 0.5, output: 30, source: "https://developers.openai.com/api/docs/pricing" },
    { id: "gpt-5.4", label: "GPT-5.4", agent: "codex", input: 2.5, cacheWrite: 0, cacheRead: 0.25, output: 15, source: "https://developers.openai.com/api/docs/pricing" },
    { id: "gpt-5.3-codex", label: "GPT-5.3-Codex", agent: "codex", input: 1.75, cacheWrite: 0, cacheRead: 0.175, output: 14, source: "https://developers.openai.com/api/docs/pricing" }
  ]
};

// src/model/estimate.ts
var COEFFICIENTS = coefficients_default;
var PRICING = pricing_default;
function estimate(size, agent, kind, table = COEFFICIENTS) {
  const line = table.lines[agent][kind];
  const tokens = line.base + line.perLine * size.nonTestLines + line.perFile * size.files;
  return { low: Math.round(tokens * line.low), high: Math.round(tokens * line.high), basis: table.basis };
}
function modelPrice(agent, id, table = PRICING) {
  return table.models.find((model) => model.id === (id ?? table.defaults[agent]) && model.agent === agent);
}
function dollars(tokens, model, mix) {
  return tokens / 1e6 * (mix.input * model.input + mix.cacheWrite * model.cacheWrite + mix.cacheRead * model.cacheRead + mix.output * model.output);
}
function priceRange(range, agent, model, table = COEFFICIENTS) {
  const mix = table.mix[agent];
  return { low: dollars(range.low, model, mix), high: dollars(range.high, model, mix) };
}
function tokenAmount(tokens) {
  if (tokens >= 995e3) return `${(tokens / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.max(10, Math.round(tokens / 1e4) * 10)}k`;
}
var usd = (value) => `$${Math.max(0.01, value).toFixed(2)}`;
function estimateText(range, price) {
  const tokens = `About ${tokenAmount(range.low)}\u2013${tokenAmount(range.high)} tokens`;
  const subscription = "on a subscription it uses part of your plan's limit";
  return price === null ? `${tokens} (${subscription})` : `${tokens} (about ${usd(price.low)}\u2013${usd(price.high)} at API prices; ${subscription})`;
}
function runEstimate(size, agent, kind, confirmAbove) {
  const range = estimate(size, agent, kind);
  const model = modelPrice(agent);
  return { range, text: estimateText(range, model ? priceRange(range, agent, model) : null), model: model?.id ?? null, confirm: range.high > confirmAbove };
}
function skillEstimates(size, kind) {
  const entry = (agent) => {
    const { range, text } = runEstimate(size, agent, kind, Infinity);
    return { ...range, text };
  };
  return { claude: entry("claude"), codex: entry("codex") };
}

// src/model/repoSize.ts
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join as join2 } from "node:path";

// src/model/deny.ts
var DENIED_NAMES = [".git", ".archify", ".npmrc", ".pypirc", ".netrc"];
var ENV_EXCEPTIONS = [".env.example", ".env.sample"];
var DENIED_PREFIXES = ["id_rsa", "id_ed25519"];
var DENIED_EXTENSIONS = ["pem", "key", "p12", "pfx"];
function segmentDenied(segment) {
  const name = segment.toLowerCase();
  if (DENIED_NAMES.includes(name)) return true;
  if (name === ".env" || name.startsWith(".env.") && !ENV_EXCEPTIONS.includes(name)) return true;
  if (DENIED_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && DENIED_EXTENSIONS.includes(name.slice(dot + 1));
}
function isDenied(path) {
  return path.split("/").some(segmentDenied);
}

// src/model/repoSize.ts
var SKIPPED_DIRS = [".git", "node_modules", "vendor", "dist", "build", "target", "out", ".sustain"];
var COUNT_LIMIT = 2e3;
var MAX_FILE_BYTES = 1024 * 1024;
var TIER_BOUNDS = { M: 2e4, L: 15e4 };
var READ_BUDGET = { S: 25, M: 45, L: 70 };
var LANGUAGES = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  scala: "Scala",
  groovy: "Groovy",
  gradle: "Gradle",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  fs: "F#",
  swift: "Swift",
  dart: "Dart",
  c: "C",
  h: "C",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++",
  hh: "C++",
  m: "Objective-C",
  mm: "Objective-C",
  ex: "Elixir",
  exs: "Elixir",
  erl: "Erlang",
  hs: "Haskell",
  clj: "Clojure",
  lua: "Lua",
  r: "R",
  jl: "Julia",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  ps1: "PowerShell",
  sql: "SQL",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  less: "CSS",
  vue: "Vue",
  svelte: "Svelte",
  md: "Markdown",
  mdx: "Markdown",
  rst: "reStructuredText",
  adoc: "AsciiDoc",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  proto: "Protocol Buffers",
  graphql: "GraphQL",
  tf: "Terraform"
};
var NAMED = { dockerfile: "Dockerfile", makefile: "Makefile", gemfile: "Ruby", rakefile: "Ruby" };
var BINARY = new Set(
  "png jpg jpeg gif bmp ico webp tif tiff psd pdf zip gz tgz bz2 xz 7z rar jar war ear class o a so dylib dll exe bin wasm woff woff2 ttf otf eot mp3 mp4 m4a mov avi mkv webm wav flac ogg sqlite db pyc pyo vsix lockb".split(" ")
);
var GENERATED = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(js|css)$|\.map$/;
var TEST_DIRS = /* @__PURE__ */ new Set(["test", "tests", "__tests__", "spec", "specs", "e2e", "testdata", "fixtures"]);
var TEST_FILES = /(\.|_)(test|spec)\.[^./]+$|^test_[^/]+\.py$|(Test|Tests|IT)\.(java|kt|scala)$|_spec\.rb$/;
function languageOf(path) {
  if (GENERATED.test(path)) return null;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const named = NAMED[name.toLowerCase()];
  if (named !== void 0) return named;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (BINARY.has(extension)) return null;
  return LANGUAGES[extension] ?? "Other";
}
function isTestPath(path) {
  const segments = path.split("/");
  const name = segments.pop();
  return segments.some((segment) => TEST_DIRS.has(segment.toLowerCase())) || TEST_FILES.test(name);
}
function sizeFacts(size) {
  return { nonTestLines: size.lines.nonTest, files: size.files };
}
function tierOf(nonTestLines) {
  return nonTestLines < TIER_BOUNDS.M ? "S" : nonTestLines <= TIER_BOUNDS.L ? "M" : "L";
}
function skipped(path) {
  return path.split("/").some((segment) => SKIPPED_DIRS.includes(segment)) || isDenied(path);
}
function walk(root) {
  const files = [];
  const pending = [""];
  while (pending.length > 0) {
    const dir = pending.pop();
    let entries;
    try {
      entries = readdirSync(join2(root, dir), { withFileTypes: true });
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
function countFile(path) {
  let data;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    data = readFileSync(path);
  } catch {
    return null;
  }
  if (data.subarray(0, 8e3).includes(0)) return null;
  let lines = 0;
  for (let at = data.indexOf(10); at !== -1; at = data.indexOf(10, at + 1)) lines++;
  return data.length > 0 && data[data.length - 1] !== 10 ? lines + 1 : lines;
}
function listFiles(root, env = process.env) {
  const tracked = trackedFiles(root, env);
  const kept = tracked === null ? walk(root) : tracked.filter((path) => !skipped(path)).sort();
  const generated = tracked === null ? /* @__PURE__ */ new Set() : generatedFiles(root, kept, env);
  return { listing: tracked === null ? "walk" : "git", files: generated.size === 0 ? kept : kept.filter((path) => !generated.has(path)) };
}
function repoSize(root, env = process.env, limit = COUNT_LIMIT) {
  const { listing, files: listed } = listFiles(root, env);
  const candidates = [];
  for (const path of listed) {
    const language = languageOf(path);
    if (language !== null) candidates.push({ path, language });
  }
  const step = Math.max(1, candidates.length / limit);
  const counts = /* @__PURE__ */ new Map();
  const means = /* @__PURE__ */ new Map();
  for (let at = 0; at < candidates.length; at += step) {
    const index = Math.floor(at);
    const file = candidates[index];
    const count = countFile(join2(root, file.path));
    counts.set(index, count);
    if (count === null) continue;
    const seen = means.get(file.language) ?? { files: 0, lines: 0 };
    means.set(file.language, { files: seen.files + 1, lines: seen.lines + count });
  }
  const all = [...means.values()].reduce((sum, entry) => ({ files: sum.files + entry.files, lines: sum.lines + entry.lines }), { files: 0, lines: 0 });
  const meanLines = (language) => {
    const entry = means.get(language) ?? all;
    return entry.files > 0 ? entry.lines / entry.files : 0;
  };
  const languages = /* @__PURE__ */ new Map();
  let files = 0;
  let counted = 0;
  for (const [index, file] of candidates.entries()) {
    const known = counts.get(index);
    if (known === null) continue;
    if (known !== void 0) counted++;
    const count = known ?? meanLines(file.language);
    files++;
    const entry = languages.get(file.language) ?? { language: file.language, files: 0, lines: 0, testLines: 0 };
    entry.files++;
    entry.lines += count;
    if (isTestPath(file.path)) entry.testLines += count;
    languages.set(file.language, entry);
  }
  const sorted = [...languages.values()].map((entry) => ({ ...entry, lines: Math.round(entry.lines), testLines: Math.round(entry.testLines) })).sort((a, b) => b.lines - a.lines || a.language.localeCompare(b.language));
  const total = sorted.reduce((sum, entry) => sum + entry.lines, 0);
  const test = sorted.reduce((sum, entry) => sum + entry.testLines, 0);
  return { listing, files, counted, lines: { total, test, nonTest: total - test }, languages: sorted, tier: tierOf(total - test) };
}

// src/model/runFolder.ts
import { mkdirSync, realpathSync as realpathSync2, statSync as statSync2, unlinkSync } from "node:fs";
import { basename as basename2, dirname as dirname2, join as join4, resolve, sep } from "node:path";

// src/model/jsonFile.ts
import { closeSync, fsyncSync, openSync, readFileSync as readFileSync2, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join as join3 } from "node:path";

// src/model/types.ts
function stringifyDocument(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}

// src/model/jsonFile.ts
function writeAtomic(path, content) {
  const temp = join3(dirname(path), `.${basename(path)}.tmp-${process.pid}-${Date.now()}`);
  try {
    const fd = openSync(temp, "wx");
    try {
      writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
function writeJson(path, value) {
  writeAtomic(path, stringifyDocument(value));
}

// src/model/runFolder.ts
var ARCHIFY_DIR = ".archify";
var DRAFT_FILE = "draft.json";
var SLUG_MAX = 40;
var RUN_NAME_PATTERN = /^([a-z0-9]+)-(.+)-(\d{8}-\d{6})(?:-(\d+))?$/;
var MAX_COLLISIONS = 1e3;
function kebab(text) {
  let out = "";
  for (const ch of text) {
    if (/^[A-Za-z0-9]$/.test(ch)) out += ch.toLowerCase();
    else if (out !== "" && !out.endsWith("-")) out += "-";
    if (out.length > SLUG_MAX) break;
  }
  if (out.length > SLUG_MAX) {
    const head = out.slice(0, SLUG_MAX);
    const lastDash = head.lastIndexOf("-");
    out = out[SLUG_MAX] === "-" || lastDash < 0 ? head : head.slice(0, lastDash);
  }
  return out.replace(/-+$/, "");
}
function slugify(focus, repoFolderName) {
  return kebab(focus) || kebab(repoFolderName) || "repo";
}
function runTimestamp(date) {
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}
function parseRunName(name) {
  const match = RUN_NAME_PATTERN.exec(name);
  if (!match) return null;
  return { prefix: match[1], slug: match[2], timestamp: match[3], n: match[4] === void 0 ? 1 : Number(match[4]) };
}
function isInside(parentReal, childReal) {
  return childReal.startsWith(parentReal.endsWith(sep) ? parentReal : parentReal + sep);
}
function createRunFolder(root, slug, timestamp, options = {}) {
  const dir = options.dir ?? ARCHIFY_DIR;
  const prefix = options.prefix ?? "architecture";
  if (dir === "." || dir === ".." || /[/\\]/.test(dir)) throw new Error(`"${dir}" is not a valid run folder directory`);
  if (!/^[a-z0-9]+$/.test(prefix)) throw new Error(`"${prefix}" is not a valid run folder prefix`);
  const base = `${prefix}-${slug}-${timestamp}`;
  if (!parseRunName(base) || /[/\\]/.test(base)) throw new Error(`"${base}" is not a valid run folder name`);
  const parent = join4(root, dir);
  mkdirSync(parent, { recursive: true });
  const parentReal = realpathSync2(parent);
  if (!isInside(realpathSync2(root), parentReal) || !statSync2(parentReal).isDirectory()) {
    throw new Error(`${dir} must be a folder inside the repository root`);
  }
  for (let n = 1; n <= MAX_COLLISIONS; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    try {
      mkdirSync(join4(parentReal, name));
      return name;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`can't create ${dir}/${base}: too many folders with that name`);
}

// src/model/runRecord.ts
import { join as join5 } from "node:path";

// src/model/confine.ts
import { lstatSync as lstatSync2, realpathSync as realpathSync3 } from "node:fs";
import { dirname as dirname3, isAbsolute, relative } from "node:path";
function isWithin(parentReal, childReal) {
  const rel = relative(parentReal, childReal);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
function lstatOrNull(path) {
  try {
    return lstatSync2(path);
  } catch {
    return null;
  }
}
function assertNotLink(path) {
  if (lstatOrNull(path)?.isSymbolicLink()) throw new Error(`${path} is a link. Sustain does not write through links.`);
}
function assertWritable(root, path) {
  const rootReal = realpathSync3(root);
  let ancestor = dirname3(path);
  while (lstatOrNull(ancestor) === null && dirname3(ancestor) !== ancestor) ancestor = dirname3(ancestor);
  let ancestorReal;
  try {
    ancestorReal = realpathSync3(ancestor);
  } catch {
    throw new Error(`${path} would be written through a broken link at ${ancestor}`);
  }
  if (!isWithin(rootReal, ancestorReal)) throw new Error(`${path} would be written outside ${root}`);
  assertNotLink(path);
}

// src/model/runRecord.ts
var RUN_FILE = "run.json";
function newRunRecord(fields, now = /* @__PURE__ */ new Date()) {
  return {
    schema: 1,
    kind: fields.kind ?? "full",
    focus: fields.focus,
    paths: fields.paths ?? [],
    base: fields.base ?? null,
    parent: null,
    createdAt: now.toISOString(),
    skillVersion: fields.skillVersion,
    phase: "created",
    attempts: 0
  };
}
function writeRunRecord(root, runDir, record) {
  const path = join5(runDir, RUN_FILE);
  assertWritable(root, path);
  writeJson(path, record);
}

// src/model/scriptArgs.ts
function parseArgs(args, spec) {
  const count = spec.positionals ?? 0;
  if (args.length < count) return null;
  const parsed = { positionals: args.slice(0, count), options: {}, switches: /* @__PURE__ */ new Set() };
  const seen = /* @__PURE__ */ new Set();
  for (let i = count; i < args.length; i += 1) {
    const arg = args[i];
    const name = arg.startsWith("--") ? arg.slice(2) : null;
    if (name === null || seen.has(name) && spec.repeatable !== true) return null;
    seen.add(name);
    if (spec.switches?.includes(name)) {
      parsed.switches.add(name);
    } else if (spec.options?.includes(name)) {
      const value = args[i + 1];
      if (value === void 0) return null;
      parsed.options[name] = value;
      i += 1;
    } else {
      return null;
    }
  }
  return parsed;
}
function usageError(script, message) {
  process.stderr.write(`${script}: ${message}
`);
  return 2;
}

// src/agent/repo-facts.ts
var SKILL_VERSION = "0.2.0";
var SCRIPT = "repo-facts.mjs";
function main(args) {
  const parsed = parseArgs(args, { options: ["focus"], repeatable: true });
  if (!parsed) return usageError(SCRIPT, "usage: node repo-facts.mjs [--focus <text>]");
  const focus = parsed.options["focus"] ?? "";
  const root = process.cwd();
  const git = collectGitFacts(root);
  let run2;
  try {
    run2 = createRunFolder(root, slugify(focus, basename3(root)), runTimestamp(/* @__PURE__ */ new Date()));
    writeRunRecord(root, join6(root, ARCHIFY_DIR, run2), newRunRecord({ focus, skillVersion: SKILL_VERSION }));
  } catch (error) {
    return usageError(SCRIPT, error.message);
  }
  const size = repoSize(root);
  const facts = {
    root,
    runFolder: `${ARCHIFY_DIR}/${run2}`,
    draft: `${ARCHIFY_DIR}/${run2}/${DRAFT_FILE}`,
    git: git && { head: git.head, origin: git.origin, dirtyCount: git.dirtyCount, dirty: git.dirty },
    size,
    estimate: skillEstimates(sizeFacts(size), "full"),
    budget: READ_BUDGET[size.tier]
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}
`);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
