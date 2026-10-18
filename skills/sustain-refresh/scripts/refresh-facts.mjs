// src/agent/refresh-facts.ts
import { readdirSync as readdirSync3, readFileSync as readFileSync5, realpathSync as realpathSync3, statSync as statSync3, writeFileSync } from "node:fs";
import { basename as basename2, join as join7 } from "node:path";

// src/model/confine.ts
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative } from "node:path";
function isWithin(parentReal, childReal) {
  const rel = relative(parentReal, childReal);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}
function assertNotLink(path) {
  if (lstatOrNull(path)?.isSymbolicLink()) throw new Error(`${path} is a link. Sustain does not write through links.`);
}
function assertWritable(root, path) {
  const rootReal = realpathSync(root);
  let ancestor = dirname(path);
  while (lstatOrNull(ancestor) === null && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
  let ancestorReal;
  try {
    ancestorReal = realpathSync(ancestor);
  } catch {
    throw new Error(`${path} would be written through a broken link at ${ancestor}`);
  }
  if (!isWithin(rootReal, ancestorReal)) throw new Error(`${path} would be written outside ${root}`);
  assertNotLink(path);
}

// src/model/staleness.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { join as join3 } from "node:path";

// src/model/fingerprints.ts
import { createHash } from "node:crypto";

// src/model/session.ts
import {
  appendFileSync,
  closeSync as closeSync2,
  existsSync,
  fsyncSync as fsyncSync2,
  mkdirSync as mkdirSync2,
  openSync as openSync2,
  readFileSync,
  renameSync as renameSync2,
  rmSync as rmSync2,
  writeSync as writeSync2
} from "node:fs";
import { dirname as dirname3, join as join2 } from "node:path";

// src/model/runFolder.ts
import { closeSync, fsyncSync, mkdirSync, openSync, realpathSync as realpathSync2, renameSync, rmSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname as dirname2, join, resolve, sep } from "node:path";
var ARCHIFY_DIR = ".archify";
var DRAFT_FILE = "draft.json";
var CANDIDATE_FILE = "candidate.json";
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
  const parent = join(root, dir);
  mkdirSync(parent, { recursive: true });
  const parentReal = realpathSync2(parent);
  if (!isInside(realpathSync2(root), parentReal) || !statSync(parentReal).isDirectory()) {
    throw new Error(`${dir} must be a folder inside the repository root`);
  }
  for (let n = 1; n <= MAX_COLLISIONS; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    try {
      mkdirSync(join(parentReal, name));
      return name;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`can't create ${dir}/${base}: too many folders with that name`);
}

// src/model/session.ts
var STALE_IDLE_MS = 24 * 60 * 60 * 1e3;
function writeAtomic(path, content) {
  const temp = join2(dirname3(path), `.tmp-${process.pid}-${Date.now()}`);
  try {
    const fd = openSync2(temp, "wx");
    try {
      writeSync2(fd, content);
      fsyncSync2(fd);
    } finally {
      closeSync2(fd);
    }
    renameSync2(temp, path);
  } catch (error) {
    rmSync2(temp, { force: true });
    throw error;
  }
}
function writeJson(path, value) {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}
`);
}

// src/model/fingerprints.ts
var FINGERPRINTS_FILE = "fingerprints.json";
function gitBlobId(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function normalizedLines(text) {
  return text.split("\n").map((line) => line.trimEnd());
}
function hashLines(lines) {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
function looseLines(lines) {
  return lines.map((line) => line.trimStart());
}

// src/model/types.ts
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function pointerToken(token) {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

// src/model/staleness.ts
var ORDER = ["fresh", "unknown", "moved", "edited", "missing"];
function readFingerprints(runDir) {
  try {
    const value = JSON.parse(readFileSync2(join3(runDir, FINGERPRINTS_FILE), "utf8"));
    return isJsonObject(value) && value["schema"] === 1 && Array.isArray(value["citations"]) ? value : null;
  } catch {
    return null;
  }
}
function findBlock(lines, size, hash, near) {
  let best = null;
  for (let start = 0; start + size <= lines.length; start++) {
    if (hashLines(lines.slice(start, start + size)) !== hash) continue;
    if (best === null || Math.abs(start - near) < Math.abs(best - near)) best = start;
  }
  return best;
}
function locate(print, bytes) {
  if (print.line === void 0 || print.range === void 0) return gitBlobId(bytes) === print.blob ? { at: "same" } : null;
  const lines = normalizedLines(bytes.toString("utf8"));
  const start = print.line - 1;
  const size = (print.end_line ?? print.line) - print.line + 1;
  if (hashLines(lines.slice(start, start + size)) === print.range) return { at: "same" };
  let found = findBlock(lines, size, print.range, start);
  if (found === null && print.loose !== void 0) found = findBlock(looseLines(lines), size, print.loose, start);
  return found === null ? null : { at: "elsewhere", line: found + 1 };
}
function classify(print, read, renames) {
  const base = { component: print.component, index: print.index, path: print.path };
  const size = print.line === void 0 ? 0 : (print.end_line ?? print.line) - print.line;
  const moved = (path, line) => ({
    ...base,
    state: "moved",
    now: line === void 0 ? { path } : { path, line, ...size > 0 ? { end_line: line + size } : {} }
  });
  const bytes = read(print.path);
  if (bytes !== null) {
    const where2 = locate(print, bytes);
    if (where2 === null) return { ...base, state: "edited" };
    return where2.at === "same" ? { ...base, state: "fresh" } : moved(print.path, where2.line);
  }
  const renamed = renames.get(print.path);
  const renamedBytes = renamed === void 0 ? null : read(renamed);
  if (renamed === void 0 || renamedBytes === null) return { ...base, state: "missing" };
  const where = locate(print, renamedBytes);
  if (where === null) return { ...base, state: "edited" };
  return moved(renamed, where.at === "same" ? print.line : where.line);
}
function worse(a, b) {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}
function mapFreshness(prints, read, renames) {
  if (prints === null) return { revision: null, createdAt: null, citations: [], boxes: {} };
  const citations = prints.citations.map((print) => classify(print, read, renames));
  const boxes = {};
  for (const citation of citations) boxes[citation.component] = worse(boxes[citation.component] ?? "fresh", citation.state);
  return { revision: prints.revision, createdAt: prints.createdAt, citations, boxes };
}
function fileReader(root) {
  return (path) => {
    try {
      return readFileSync2(join3(root, ...path.split("/")));
    } catch {
      return null;
    }
  };
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
      },
      refresh: {
        base: 6e4,
        perLine: 0.3,
        perFile: 10,
        low: 0.6,
        high: 1.6
      },
      ask: {
        base: 3e4,
        perLine: 0.1,
        perFile: 5,
        low: 0.5,
        high: 2
      }
    },
    codex: {
      full: {
        base: 9e4,
        perLine: 1.5,
        perFile: 30,
        low: 0.7,
        high: 1.4
      },
      refresh: {
        base: 45e3,
        perLine: 0.3,
        perFile: 10,
        low: 0.6,
        high: 1.6
      },
      ask: {
        base: 25e3,
        perLine: 0.1,
        perFile: 5,
        low: 0.5,
        high: 2
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

// src/model/git.ts
import { spawnSync } from "node:child_process";

// src/model/changes.ts
var REVISION_PATTERN = /^(?!-)[A-Za-z0-9._/~^@{}-]+$/;

// src/model/which.ts
import { accessSync, constants, statSync as statSync2 } from "node:fs";
import { delimiter, join as join4, posix, win32 } from "node:path";
function isExecutableFile(path, platform) {
  try {
    if (!statSync2(path).isFile()) return false;
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
      const candidate = join4(dir, cli + extension);
      if (isExecutableFile(candidate, platform)) return candidate;
    }
  }
  return void 0;
}

// src/model/git.ts
var GIT_PREFIX = ["-c", "core.fsmonitor=false", "--no-optional-locks"];
var GIT_READS = {
  topLevel: [...GIT_PREFIX, "rev-parse", "--show-toplevel"],
  head: [...GIT_PREFIX, "rev-parse", "--verify", "--quiet", "HEAD"],
  origin: [...GIT_PREFIX, "config", "--get", "remote.origin.url"],
  status: [...GIT_PREFIX, "status", "--porcelain=v1", "-z"]
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
function renamesSince(root, revision, env = process.env, to) {
  const renames = /* @__PURE__ */ new Map();
  const program = gitProgram(env);
  if (program === void 0 || !/^[0-9a-f]{7,64}$/i.test(revision) || to !== void 0 && !REVISION_PATTERN.test(to)) return renames;
  const output = run(program, root, [...GIT_PREFIX, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "--name-status", "-z", revision, ...to === void 0 ? [] : [to], "--"]);
  const fields = (output ?? "").split("\0");
  for (let i = 0; i < fields.length; i++) {
    const status = fields[i];
    if (/^[RC]\d*$/.test(status)) {
      if (status.startsWith("R")) renames.set(fields[i + 1], fields[i + 2]);
      i += 2;
    } else if (/^[AMDTUX]$/.test(status)) {
      i += 1;
    }
  }
  return renames;
}
function numstatSince(root, revision, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0 || !REVISION_PATTERN.test(revision)) return null;
  const output = run(program, root, [...GIT_PREFIX, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--numstat", "-M", "-z", revision, "--"]);
  if (output === null) return null;
  const stats = [];
  const fields = output.split("\0");
  for (let i = 0; i < fields.length; i++) {
    const record = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(fields[i]);
    if (!record) continue;
    const count = (value) => value === "-" ? null : Number(value);
    let path = record[3];
    if (path === "") {
      path = fields[i + 2] ?? "";
      i += 2;
    }
    stats.push({ path, added: count(record[1]), deleted: count(record[2]) });
  }
  return stats;
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
function untrackedFiles(root, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0) return [];
  return (run(program, root, [...GIT_PREFIX, "ls-files", "--others", "--exclude-standard", "-z"]) ?? "").split("\0").filter((path) => path !== "");
}
function foldersAt(root, revision, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0 || !REVISION_PATTERN.test(revision)) return null;
  const output = run(program, root, [...GIT_PREFIX, "ls-tree", "-d", "--name-only", "-z", revision]);
  return output === null ? null : new Set(output.split("\0").filter((name) => name !== ""));
}

// src/model/refresh.ts
function globToRegExp(glob) {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      pattern += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}(?:/.*)?$`);
}
function inScope(path, globs) {
  return globs.length === 0 || globs.some((glob) => glob.test(path));
}
function refreshReport(inputs) {
  const stale = inputs.freshness.citations.filter((citation) => citation.state !== "fresh" && inScope(citation.path, inputs.globs));
  const boxes = [...new Set(stale.filter((citation) => citation.state === "edited" || citation.state === "missing").map((citation) => citation.component))];
  const all = [...inputs.changes ?? [], ...inputs.untracked.map((path) => ({ path, added: null, deleted: null }))];
  const changes = all.filter((change) => inScope(change.path, inputs.globs)).map((change) => ({ ...change, covered: inputs.cited.has(change.path) }));
  const newFolders = inputs.foldersThen === null ? [] : inputs.foldersNow.filter((folder) => !inputs.foldersThen.has(folder) && inScope(folder, inputs.globs));
  return { stale, boxes, changes, uncovered: changes.filter((change) => !change.covered).map((change) => change.path), newFolders };
}

// src/model/repoSize.ts
import { lstatSync as lstatSync2, readdirSync, readFileSync as readFileSync3 } from "node:fs";
import { join as join5 } from "node:path";

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
      entries = readdirSync(join5(root, dir), { withFileTypes: true });
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
    const stat = lstatSync2(path);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    data = readFileSync3(path);
  } catch {
    return null;
  }
  if (data.subarray(0, 8e3).includes(0)) return null;
  let lines = 0;
  for (let at = data.indexOf(10); at !== -1; at = data.indexOf(10, at + 1)) lines++;
  return data.length > 0 && data[data.length - 1] !== 10 ? lines + 1 : lines;
}
function repoSize(root, env = process.env, limit = COUNT_LIMIT) {
  const tracked = trackedFiles(root, env);
  const kept = tracked === null ? walk(root) : tracked.filter((path) => !skipped(path)).sort();
  const generated = tracked === null ? /* @__PURE__ */ new Set() : generatedFiles(root, kept, env);
  const candidates = [];
  for (const path of kept) {
    const language = generated.has(path) ? null : languageOf(path);
    if (language !== null) candidates.push({ path, language });
  }
  const step = Math.max(1, candidates.length / limit);
  const counts = /* @__PURE__ */ new Map();
  const means = /* @__PURE__ */ new Map();
  for (let at = 0; at < candidates.length; at += step) {
    const index = Math.floor(at);
    const file = candidates[index];
    const count = countFile(join5(root, file.path));
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
  return { listing: tracked === null ? "walk" : "git", files, counted, lines: { total, test, nonTest: total - test }, languages: sorted, tier: tierOf(total - test) };
}

// src/model/runRecord.ts
import { readdirSync as readdirSync2, readFileSync as readFileSync4 } from "node:fs";
import { join as join6 } from "node:path";
var RUN_FILE = "run.json";
function newRunRecord(fields, now = /* @__PURE__ */ new Date()) {
  return {
    schema: 1,
    kind: fields.kind ?? "full",
    focus: fields.focus,
    paths: fields.paths ?? [],
    base: fields.base ?? null,
    parent: fields.parent ?? null,
    createdAt: now.toISOString(),
    skillVersion: fields.skillVersion,
    phase: "created",
    attempts: 0
  };
}
function readRunRecord(runDir) {
  try {
    const value = JSON.parse(readFileSync4(join6(runDir, RUN_FILE), "utf8"));
    return isJsonObject(value) && value["schema"] === 1 && typeof value["phase"] === "string" ? value : null;
  } catch {
    return null;
  }
}
function writeRunRecord(root, runDir, record) {
  const path = join6(runDir, RUN_FILE);
  assertWritable(root, path);
  writeJson(path, record);
}

// src/model/submission.ts
var META_DROPS = ["viewBox", "views", "animation", "translations", "visual_preset", "engineering_profile"];
var COMPONENT_DROPS = ["pos", "size", "row", "col", "icon", "brand"];
var CONNECTION_DROPS = ["fromSide", "toSide", "route", "via", "labelAt", "labelDx", "labelDy", "labelSegment", "width"];
var BOUNDARY_DROPS = ["pad"];
function dropKeys(object, keys, prefix, removed) {
  for (const key of keys) {
    if (Object.hasOwn(object, key)) {
      delete object[key];
      removed.push(`${prefix}/${pointerToken(key)}`);
    }
  }
}
function dropInArray(root, field, keys, removed) {
  const items = root[field];
  if (!Array.isArray(items)) return;
  items.forEach((item, i) => {
    if (isJsonObject(item)) dropKeys(item, keys, `/${field}/${i}`, removed);
  });
}
function stripAppOwned(value) {
  const copy = structuredClone(value);
  if (!isJsonObject(copy)) return copy;
  const removed = [];
  dropKeys(copy, ["layout"], "", removed);
  if (isJsonObject(copy["meta"])) dropKeys(copy["meta"], [...META_DROPS, "locale", "quality_profile", "output", "repository"], "/meta", removed);
  dropInArray(copy, "components", COMPONENT_DROPS, removed);
  dropInArray(copy, "connections", CONNECTION_DROPS, removed);
  dropInArray(copy, "boundaries", BOUNDARY_DROPS, removed);
  return copy;
}

// src/agent/refresh-facts.ts
var SKILL_VERSION = "0.2.0";
var NOT_SOURCE = /* @__PURE__ */ new Set(["node_modules", "dist", "out", "build", "coverage", "target", "vendor"]);
var USAGE = "usage: node refresh-facts.mjs --from <run> [--paths <glob>\u2026]";
function fail(message) {
  process.stderr.write(`refresh-facts.mjs: ${message}
`);
  return 2;
}
function parseArgs(args) {
  if (args[0] !== "--from" || args[1] === void 0) return USAGE;
  if (args.length === 2) return { from: args[1], paths: [] };
  if (args[2] !== "--paths" || args.length === 3) return USAGE;
  return { from: args[1], paths: args.slice(3) };
}
function citedPaths(doc) {
  const cited = /* @__PURE__ */ new Set();
  const components = isJsonObject(doc) && Array.isArray(doc["components"]) ? doc["components"] : [];
  for (const component of components) {
    const sources = isJsonObject(component) && Array.isArray(component["sources"]) ? component["sources"] : [];
    for (const source of sources) if (isJsonObject(source) && typeof source["path"] === "string") cited.add(source["path"]);
  }
  return cited;
}
function topLevelFolders(root) {
  return readdirSync3(root).filter((name) => !name.startsWith(".") && !NOT_SOURCE.has(name)).filter((name) => {
    try {
      return statSync3(join7(root, name)).isDirectory();
    } catch {
      return false;
    }
  }).sort();
}
function main(args) {
  const parsed = parseArgs(args);
  if (typeof parsed === "string") return fail(parsed);
  const root = process.cwd();
  const base = parsed.from.replace(/^\.archify\//, "").replace(/\/+$/, "");
  if (!/^[a-z0-9]+-[A-Za-z0-9._-]+$/.test(base) || base.includes("..")) return fail(`--from names a run folder in ${ARCHIFY_DIR}/, such as architecture-app-20261018-120000`);
  const baseDir = join7(root, ARCHIFY_DIR, base);
  let doc;
  try {
    const candidate = join7(baseDir, CANDIDATE_FILE);
    if (!isWithin(realpathSync3(root), realpathSync3(candidate))) return fail(`${ARCHIFY_DIR}/${base}/${CANDIDATE_FILE} lies outside the repository`);
    doc = JSON.parse(readFileSync5(candidate, "utf8"));
  } catch (error) {
    return fail(`cannot read ${ARCHIFY_DIR}/${base}/${CANDIDATE_FILE}: ${error.message}`);
  }
  const globs = parsed.paths.map(globToRegExp);
  const prints = readFingerprints(baseDir);
  const revision = prints?.revision ?? null;
  const outsideMaps = (path) => !path.startsWith(`${ARCHIFY_DIR}/`);
  const changes = revision === null ? null : (numstatSince(root, revision) ?? []).filter((change) => outsideMaps(change.path));
  const untracked = revision === null ? [] : untrackedFiles(root).filter(outsideMaps);
  const freshness = mapFreshness(prints, fileReader(root), revision === null ? /* @__PURE__ */ new Map() : renamesSince(root, revision));
  const report = refreshReport({
    freshness,
    cited: citedPaths(doc),
    changes,
    untracked,
    foldersNow: topLevelFolders(root),
    foldersThen: revision === null ? null : foldersAt(root, revision),
    globs
  });
  const focus = readRunRecord(baseDir)?.focus ?? "";
  let run2;
  try {
    run2 = createRunFolder(root, slugify(focus, basename2(root)), runTimestamp(/* @__PURE__ */ new Date()));
    const runDir = join7(root, ARCHIFY_DIR, run2);
    writeRunRecord(root, runDir, newRunRecord({ kind: "refresh", focus, paths: parsed.paths, base, skillVersion: SKILL_VERSION }));
    const draft = join7(runDir, DRAFT_FILE);
    assertWritable(root, draft);
    writeFileSync(draft, `${JSON.stringify(stripAppOwned(doc), null, 2)}
`);
  } catch (error) {
    return fail(error.message);
  }
  const facts = {
    root,
    runFolder: `${ARCHIFY_DIR}/${run2}`,
    draft: `${ARCHIFY_DIR}/${run2}/${DRAFT_FILE}`,
    base: { runFolder: `${ARCHIFY_DIR}/${base}`, revision, createdAt: prints?.createdAt ?? null, fingerprints: prints !== null },
    paths: parsed.paths,
    boxes: report.boxes,
    stale: report.stale,
    changes: report.changes,
    uncovered: report.uncovered,
    newFolders: report.newFolders,
    estimate: skillEstimates(sizeFacts(repoSize(root)), "refresh")
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}
`);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
