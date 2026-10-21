// src/agent/session.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { existsSync as existsSync2, readFileSync as readFileSync3, realpathSync as realpathSync4, statSync as statSync3, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { basename as basename2, join as join4, relative as relative2, resolve as resolve2, sep as sep2 } from "node:path";

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
function runRaw(program, root2, argv) {
  const result = spawnSync(program, argv, {
    cwd: root2,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}
function run(program, root2, argv) {
  return runRaw(program, root2, argv)?.toString("utf8") ?? null;
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
function collectGitFacts(root2, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0) return null;
  const top = run(program, root2, GIT_READS.topLevel);
  if (top === null) return null;
  try {
    if (realpathSync(top.trim()) !== realpathSync(root2)) return null;
  } catch {
    return null;
  }
  const head = run(program, root2, GIT_READS.head)?.trim().toLowerCase();
  if (head === void 0 || !/^[0-9a-f]{40}$/.test(head)) return null;
  const origin = run(program, root2, GIT_READS.origin)?.trim() ?? "";
  const allDirty = parsePorcelainZ(run(program, root2, GIT_READS.status) ?? "").filter((path) => !path.startsWith(".archify/"));
  return {
    head,
    origin: origin === "" ? null : sanitizeOrigin(origin),
    dirtyCount: allDirty.length,
    dirty: allDirty.slice(0, MAX_DIRTY_PATHS)
  };
}

// src/model/runFolder.ts
import { closeSync, fsyncSync, mkdirSync, openSync, realpathSync as realpathSync2, renameSync, rmSync, statSync as statSync2, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join as join2, resolve, sep } from "node:path";
var ARCHIFY_DIR = ".archify";
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
function createRunFolder(root2, slug, timestamp, options = {}) {
  const dir = options.dir ?? ARCHIFY_DIR;
  const prefix = options.prefix ?? "architecture";
  if (dir === "." || dir === ".." || /[/\\]/.test(dir)) throw new Error(`"${dir}" is not a valid run folder directory`);
  if (!/^[a-z0-9]+$/.test(prefix)) throw new Error(`"${prefix}" is not a valid run folder prefix`);
  const base = `${prefix}-${slug}-${timestamp}`;
  if (!parseRunName(base) || /[/\\]/.test(base)) throw new Error(`"${base}" is not a valid run folder name`);
  const parent = join2(root2, dir);
  mkdirSync(parent, { recursive: true });
  const parentReal = realpathSync2(parent);
  if (!isInside(realpathSync2(root2), parentReal) || !statSync2(parentReal).isDirectory()) {
    throw new Error(`${dir} must be a folder inside the repository root`);
  }
  for (let n = 1; n <= MAX_COLLISIONS; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    try {
      mkdirSync(join2(parentReal, name));
      return name;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`can't create ${dir}/${base}: too many folders with that name`);
}

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
import { dirname as dirname3, join as join3 } from "node:path";

// src/model/confine.ts
import { lstatSync, realpathSync as realpathSync3 } from "node:fs";
import { dirname as dirname2, isAbsolute, relative } from "node:path";
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
function assertWritable(root2, path) {
  const rootReal = realpathSync3(root2);
  let ancestor = dirname2(path);
  while (lstatOrNull(ancestor) === null && dirname2(ancestor) !== ancestor) ancestor = dirname2(ancestor);
  let ancestorReal;
  try {
    ancestorReal = realpathSync3(ancestor);
  } catch {
    throw new Error(`${path} would be written through a broken link at ${ancestor}`);
  }
  if (!isWithin(rootReal, ancestorReal)) throw new Error(`${path} would be written outside ${root2}`);
  assertNotLink(path);
}

// src/model/session.ts
var SUSTAIN_DIR = ".sustain";
var ACTIVE_FILE = "active";
var SESSION_FILE = "session.json";
var EVENTS_FILE = "events.jsonl";
var MANIFEST_FILE = "manifest.json";
var SESSION_PHASES = ["clarify", "implementing", "hunting", "paused", "done"];
var LIVE_PHASES = ["clarify", "implementing", "hunting"];
var SESSION_MODES = ["bugfix"];
var STALE_IDLE_MS = 24 * 60 * 60 * 1e3;
var MUTATION_KINDS = ["off-by-one", "flipped-comparison", "missing-await", "and-or-swap", "reference-equality"];
function languageOf(path) {
  if (/\.(mjs|cjs|mts|cts|js|jsx|ts|tsx)$/.test(path)) return "js";
  if (/\.java$/.test(path)) return "java";
  return null;
}
var KIND_TIER = {
  "off-by-one": "T1",
  "flipped-comparison": "T1",
  "missing-await": "T2",
  "and-or-swap": "T1",
  "reference-equality": "T2"
};
var TIER_POINTS = { T1: 10, T2: 20, T3: 30 };
var HINT_LEVELS = [1, 2, 3];
var HINT_COST = { 1: 5, 2: 10, 3: 15 };
function newSession(mode, now = /* @__PURE__ */ new Date()) {
  const ts = now.toISOString();
  return { version: 1, mode, phase: "clarify", stepIndex: 0, steps: [], bugs: 0, found: 0, fixed: 0, score: 0, createdAt: ts, updatedAt: ts };
}
function newManifest() {
  return { version: 1, bugs: [] };
}
function scoreSession(manifest) {
  let score = 0;
  for (const bug of manifest.bugs) {
    if (bug.found && bug.fixed && bug.restored !== true) score += TIER_POINTS[KIND_TIER[bug.kind]];
    for (const level of bug.hints) score -= HINT_COST[level];
  }
  return Math.max(0, score);
}
function sessionIdleMs(session, now = /* @__PURE__ */ new Date()) {
  const updated = Date.parse(session.updatedAt);
  return Number.isNaN(updated) ? Number.POSITIVE_INFINITY : now.getTime() - updated;
}
function isSessionStale(session, now = /* @__PURE__ */ new Date()) {
  return session.phase !== "done" && sessionIdleMs(session, now) > STALE_IDLE_MS;
}
function appendEvent(runDir, event, now = /* @__PURE__ */ new Date()) {
  mkdirSync2(runDir, { recursive: true });
  assertNotLink(join3(runDir, EVENTS_FILE));
  const line = { ts: now.toISOString(), ...event };
  appendFileSync(join3(runDir, EVENTS_FILE), `${JSON.stringify(line)}
`);
}
function writeAtomic(path, content) {
  const temp = join3(dirname3(path), `.tmp-${process.pid}-${Date.now()}`);
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
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function corrupt(file, problem) {
  return new Error(`${file} is corrupt: ${problem}`);
}
function checkSteps(value, file) {
  if (!Array.isArray(value)) throw corrupt(file, `steps is not an array`);
  return value.map((item, i) => {
    if (!isRecord(item) || typeof item["title"] !== "string" || item["title"] === "") throw corrupt(file, `steps[${i}] has no title`);
    const files = item["files"] ?? [];
    if (!Array.isArray(files) || files.some((f) => typeof f !== "string")) throw corrupt(file, `steps[${i}].files is not a string list`);
    const step = { title: item["title"], files };
    if (typeof item["check"] === "string") step.check = item["check"];
    return step;
  });
}
function checkSession(value, file = SESSION_FILE) {
  if (!isRecord(value)) throw corrupt(file, "not an object");
  if (!SESSION_MODES.includes(value["mode"])) throw corrupt(file, `unknown mode ${JSON.stringify(value["mode"])}`);
  if (!SESSION_PHASES.includes(value["phase"])) throw corrupt(file, `unknown phase ${JSON.stringify(value["phase"])}`);
  if (value["pausedFrom"] !== void 0 && !LIVE_PHASES.includes(value["pausedFrom"])) {
    throw corrupt(file, `pausedFrom is not a live phase`);
  }
  for (const key of ["stepIndex", "bugs", "found", "fixed", "score"]) {
    if (typeof value[key] !== "number") throw corrupt(file, `${key} is not a number`);
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (typeof value[key] !== "string") throw corrupt(file, `${key} is not a string`);
  }
  const steps = checkSteps(value["steps"], file);
  return { ...value, steps };
}
function checkManifest(value, file = MANIFEST_FILE) {
  if (!isRecord(value) || !Array.isArray(value["bugs"])) throw corrupt(file, "bugs is not an array");
  const bugs = value["bugs"].map((item, i) => {
    const at = `bugs[${i}]`;
    if (!isRecord(item)) throw corrupt(file, `${at} is not an object`);
    for (const key of ["id", "file", "kind", "buggyHunk"]) {
      if (typeof item[key] !== "string") throw corrupt(file, `${at}.${key} is not a string`);
    }
    if (!MUTATION_KINDS.includes(item["kind"])) throw corrupt(file, `${at}.kind is unknown`);
    if (item["pristineHunk"] !== void 0 && typeof item["pristineHunk"] !== "string") throw corrupt(file, `${at}.pristineHunk is not a string`);
    const region = item["region"];
    if (!isRecord(region) || typeof region["startLine"] !== "number" || typeof region["endLine"] !== "number") {
      throw corrupt(file, `${at}.region is malformed`);
    }
    if (typeof item["step"] !== "number" || typeof item["twins"] !== "number") throw corrupt(file, `${at} counters are malformed`);
    if (typeof item["found"] !== "boolean" || typeof item["fixed"] !== "boolean") throw corrupt(file, `${at} flags are malformed`);
    if (item["restored"] !== void 0 && typeof item["restored"] !== "boolean") throw corrupt(file, `${at}.restored is not a boolean`);
    const hints = item["hints"] ?? [];
    if (!Array.isArray(hints) || hints.some((h) => !HINT_LEVELS.includes(h))) throw corrupt(file, `${at}.hints is malformed`);
    return { ...item, hints };
  });
  return { version: 1, bugs };
}
function readJsonFile(runDir, file, check) {
  const path = join3(runDir, file);
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${file} is unreadable: ${error.message}`);
  }
  return check(value, file);
}
function loadSession(runDir) {
  return readJsonFile(runDir, SESSION_FILE, checkSession);
}
function saveSession(runDir, session, now = /* @__PURE__ */ new Date()) {
  session.updatedAt = now.toISOString();
  writeJson(join3(runDir, SESSION_FILE), session);
}
function loadManifest(runDir) {
  return readJsonFile(runDir, MANIFEST_FILE, checkManifest);
}
function saveManifest(runDir, manifest) {
  writeJson(join3(runDir, MANIFEST_FILE), manifest);
}
function activeRun(root2) {
  try {
    const run2 = readFileSync(join3(root2, SUSTAIN_DIR, ACTIVE_FILE), "utf8").trim();
    return run2 !== "" && parseRunName(run2) !== null ? run2 : null;
  } catch {
    return null;
  }
}
function runExists(root2, run2) {
  return existsSync(join3(root2, SUSTAIN_DIR, run2));
}

// src/agent/modes/bugfix/mutations.ts
import { readFileSync as readFileSync2, writeFileSync } from "node:fs";
function codeMask(line) {
  const mask = new Array(line.length).fill(true);
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      mask[i] = false;
      if (ch === "\\") {
        i += 1;
        if (i < line.length) mask[i] = false;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    const next = line[i + 1];
    if (ch === "/" && next === "/") {
      for (let j = i; j < line.length; j += 1) mask[j] = false;
      break;
    }
    if (ch === "/" && next === "*") {
      let j = i;
      while (j < line.length && !(line[j] === "*" && line[j + 1] === "/")) {
        mask[j] = false;
        j += 1;
      }
      if (j + 1 < line.length) {
        mask[j] = false;
        mask[j + 1] = false;
        j += 2;
      }
      i = j - 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      mask[i] = false;
      quote = ch;
    }
  }
  return mask;
}
function maskGenerics(line, mask) {
  for (let start = 0; start < line.length; start += 1) {
    if (line[start] !== "<" || !mask[start]) continue;
    const first = /\S/.exec(line.slice(start + 1));
    if (first === null || !/[A-Z?>]/.test(first[0])) continue;
    let depth = 0;
    let end = -1;
    for (let at = start; at < line.length; at += 1) {
      const char = line[at];
      if (char === "<") depth += 1;
      else if (char === ">") depth -= 1;
      else if (!/[\w\s,.?[\]&]/.test(char) || char === "&" && line[at + 1] === "&") break;
      if (depth === 0) {
        end = at;
        break;
      }
    }
    if (end === -1) continue;
    for (let at = start; at <= end; at += 1) mask[at] = false;
    start = end;
  }
}
var RECEIVER = String.raw`(?<![\w$.)\]])(!?)((?!super\b)[A-Za-z_$][\w$]*(?:\([^()]*\))?(?:\.[A-Za-z_$][\w$]*(?:\([^()]*\))?)*)`;
var OFF_BY_ONE = [
  { find: /(?<![<>=!])<(?![<=])/g, to: "<=" },
  { find: /(?<![<>=!])<=/g, to: "<" },
  { find: /(?<![-=<>])>(?![=>])/g, to: ">=" },
  { find: /(?<![<>=!])>=/g, to: ">" }
];
var FLIPPED_COMPARISON = [
  { find: /===/g, to: "!==" },
  { find: /!==/g, to: "===" },
  { find: /(?<![<>=!])<=/g, to: ">=" },
  { find: /(?<![<>=!])>=/g, to: "<=" },
  { find: /(?<![<>=!])<(?![<=])/g, to: ">" },
  { find: /(?<![-=<>])>(?![=>])/g, to: "<" },
  { find: /(?<![=!])==(?![=])/g, to: "!=" },
  { find: /!=(?![=])/g, to: "==" }
];
var RULES = {
  js: {
    "off-by-one": OFF_BY_ONE,
    "flipped-comparison": FLIPPED_COMPARISON,
    "missing-await": [{ find: /(?<![.\w$])await\b\s*/g, to: "" }]
  },
  java: {
    "off-by-one": OFF_BY_ONE,
    "flipped-comparison": FLIPPED_COMPARISON,
    "and-or-swap": [
      { find: /&&/g, to: "||" },
      { find: /\|\|/g, to: "&&" }
    ],
    // `a.equals(b)` becomes `a == b`, and `!a.equals(b)` becomes `a != b`. An argument with a comma
    // at the top, such as `Objects.equals(a, b)`, or with nested calls deeper than one level, is left alone.
    "reference-equality": [
      {
        find: new RegExp(`${RECEIVER}\\.equals\\(((?:[^(),]|\\([^()]*\\))+)\\)`, "g"),
        to: (match) => `${match[2]} ${match[1] === "!" ? "!=" : "=="} ${match[3].trim()}`
      }
    ]
  }
};
var LANGUAGE_NAMES = { js: "JavaScript and TypeScript", java: "Java" };
function kindsFor(language) {
  return Object.keys(RULES[language]);
}
function firstCodeMatch(line, mask, rule) {
  for (const match of line.matchAll(rule.find)) {
    const start = match.index;
    const end = start + match[0].length;
    let inCode = true;
    for (let i = start; i < end; i += 1) {
      if (!mask[i]) {
        inCode = false;
        break;
      }
    }
    if (inCode) return match;
  }
  return null;
}
function mutateLine(line, kind, language = "js") {
  const mask = codeMask(line);
  if (language === "java") maskGenerics(line, mask);
  for (const rule of RULES[language][kind] ?? []) {
    const hit = firstCodeMatch(line, mask, rule);
    if (hit !== null) return line.slice(0, hit.index) + (typeof rule.to === "string" ? rule.to : rule.to(hit)) + line.slice(hit.index + hit[0].length);
  }
  return null;
}
function mutateText(text, line, kind, language = "js") {
  if (RULES[language][kind] === void 0) throw new Error(`"${kind}" does not apply to ${LANGUAGE_NAMES[language]}; its kinds are ${kindsFor(language).join(", ")}`);
  const lines = text.split("\n");
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    throw new Error(`line ${line} is outside the file (${lines.length} lines)`);
  }
  const pristineHunk = lines[line - 1];
  const buggyHunk = mutateLine(pristineHunk, kind, language);
  if (buggyHunk === null || buggyHunk === pristineHunk) throw new Error(`line ${line} has no "${kind}" target`);
  lines[line - 1] = buggyHunk;
  return { region: { startLine: line, endLine: line }, pristineHunk, buggyHunk, text: lines.join("\n") };
}
function mutateFile(path, line, kind) {
  const language = languageOf(path);
  if (language === null) throw new Error(`${path}: bugs are seeded in JavaScript, TypeScript and Java files only`);
  const result = mutateText(readFileSync2(path, "utf8"), line, kind, language);
  writeFileSync(path, result.text);
  return result;
}
function hunkCount(text, hunk) {
  const trimmed = hunk.trim();
  if (trimmed === "") return 0;
  return text.split("\n").filter((line) => line.trim() === trimmed).length;
}
function bugStillPresent(text, bug) {
  return hunkCount(text, bug.buggyHunk) > bug.twins;
}
function restoreHunk(text, bug) {
  if (!bugStillPresent(text, bug)) return null;
  const trimmed = bug.buggyHunk.trim();
  const lines = text.split("\n");
  let best = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const distance = Math.abs(i + 1 - bug.region.startLine);
    if (lines[i].trim() === trimmed && (best === -1 || distance < Math.abs(best + 1 - bug.region.startLine))) best = i;
  }
  if (best === -1) return null;
  lines[best] = bug.pristineHunk;
  return lines.join("\n");
}

// src/agent/session.ts
var USAGE = `usage: node session.mjs <command>
  init --mode bugfix [--name <text>]     start a session, take the .sustain/active lock
  plan --steps '<json>'                  record the plan: [{"title":\u2026,"files":[\u2026]}] or ["\u2026"]
  inject --file <f> --line <n> --kind <k>  seed one bug (kinds: off-by-one, flipped-comparison, missing-await for JS/TS; off-by-one, flipped-comparison, and-or-swap, reference-equality for Java)
  status                                 the authoritative session snapshot
  report --file <f>                      confirm <f> holds an unfixed seeded bug
  hint --level <1|2|3> [--bug <id>|--file <f>]  ledger a hint deduction
  verify [--check-exit <code>]           judge fixes; advance the step when clean
  complete                               score the session, free the lock
  pause                                  park the session; hooks go inert
  resume                                 return to the phase pause parked
  restore [--bug <id>]                   write pristine hunks back, keep the session
  abandon                                restore seeded hunks, end the session, free the lock`;
var NODE_CHECKABLE = /\.(mjs|cjs)$/;
var root = process.cwd();
function report(code, out) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}
`);
  return code;
}
function usageError(message) {
  process.stderr.write(`session.mjs: ${message}
`);
  return 2;
}
function flags(args, names) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const name = args[i];
    if (!name.startsWith("--") || !names.includes(name.slice(2))) return null;
    const value = args[i + 1];
    if (value === void 0) return null;
    out[name.slice(2)] = value;
    i += 1;
  }
  return out;
}
function loadActive() {
  const run2 = activeRun(root);
  if (run2 === null || !runExists(root, run2)) return null;
  const dir = join4(root, SUSTAIN_DIR, run2);
  const session = loadSession(dir);
  const manifest = loadManifest(dir);
  return { run: run2, dir, session, manifest };
}
function noSession() {
  return report(1, { status: "no-session", message: "no active session \u2014 run `session.mjs init` first" });
}
function ifPaused(session) {
  if (session.phase !== "paused") return null;
  return report(1, { status: "paused", phase: "paused", message: "session is paused \u2014 resume or abandon it first" });
}
function repoFile(arg) {
  const abs = resolve2(root, arg);
  let real;
  try {
    real = realpathSync4(abs);
  } catch {
    throw new Error(`${arg} does not exist`);
  }
  const rootReal = realpathSync4(root);
  if (real !== rootReal && !real.startsWith(rootReal + sep2)) {
    throw new Error(`${arg} resolves outside the repository root`);
  }
  const rel = relative2(rootReal, real).split(sep2).join("/");
  if (rel === "") throw new Error(`${arg} is the repository root, not a file`);
  if (rel.split("/")[0] === SUSTAIN_DIR || isDenied(rel)) throw new Error(`${rel} is off-limits for sessions`);
  if (!statSync3(real).isFile()) throw new Error(`${rel} is not a file`);
  return { abs: real, rel };
}
function looseRel(arg) {
  let abs;
  try {
    abs = realpathSync4(resolve2(root, arg));
  } catch {
    abs = resolve2(root, arg);
  }
  const rootReal = realpathSync4(root);
  if (abs !== rootReal && !abs.startsWith(rootReal + sep2)) return null;
  return relative2(rootReal, abs).split(sep2).join("/");
}
function save(active) {
  saveSession(active.dir, active.session);
  saveManifest(active.dir, active.manifest);
}
function cmdInit(args) {
  const opts = flags(args, ["mode", "name"]);
  if (opts === null || opts["mode"] === void 0) return usageError(`init: ${USAGE.split("\n")[1].trim()}`);
  if (!SESSION_MODES.includes(opts["mode"])) {
    return usageError(`init: unknown mode ${JSON.stringify(opts["mode"])} (modes: ${SESSION_MODES.join(", ")})`);
  }
  const mode = opts["mode"];
  const warnings = [];
  const held = activeRun(root);
  if (held !== null) {
    let stale = !runExists(root, held);
    if (!stale) {
      try {
        const heldSession = checkSession(JSON.parse(readFileSync3(join4(root, SUSTAIN_DIR, held, SESSION_FILE), "utf8")));
        stale = heldSession.phase === "done" || isSessionStale(heldSession);
      } catch {
        stale = true;
      }
    }
    if (!stale) {
      return report(1, { status: "active", run: `${SUSTAIN_DIR}/${held}`, message: `session ${held} is still active` });
    }
    warnings.push(`released the stale lock of ${held}`);
  }
  const git = collectGitFacts(root);
  const run2 = createRunFolder(root, slugify(opts["name"] ?? "", basename2(root)), runTimestamp(/* @__PURE__ */ new Date()), {
    dir: SUSTAIN_DIR,
    prefix: mode
  });
  const dir = join4(root, SUSTAIN_DIR, run2);
  const session = newSession(mode);
  saveSession(dir, session);
  saveManifest(dir, newManifest());
  appendEvent(dir, { type: "init", mode });
  assertWritable(root, join4(root, SUSTAIN_DIR, ACTIVE_FILE));
  writeFileSync2(join4(root, SUSTAIN_DIR, ACTIVE_FILE), `${run2}
`);
  if (git !== null && git.dirtyCount > 0) {
    warnings.push(`repository has ${git.dirtyCount} uncommitted change(s); bug restore works on recorded hunks, not git`);
  }
  return report(0, {
    status: "ok",
    run: `${SUSTAIN_DIR}/${run2}`,
    sessionFile: `${SUSTAIN_DIR}/${run2}/${SESSION_FILE}`,
    mode,
    phase: session.phase,
    git: git && { head: git.head, origin: git.origin, dirtyCount: git.dirtyCount, dirty: git.dirty },
    ...warnings.length > 0 ? { warnings } : {}
  });
}
function cmdStatus(args) {
  if (args.length !== 0) return usageError(`status: takes no arguments`);
  const active = loadActive();
  if (active === null) return report(0, { status: "none" });
  const { session, manifest } = active;
  const step = session.steps[session.stepIndex];
  return report(0, {
    status: "ok",
    run: `${SUSTAIN_DIR}/${active.run}`,
    mode: session.mode,
    phase: session.phase,
    ...session.pausedFrom !== void 0 ? { pausedFrom: session.pausedFrom } : {},
    stepIndex: session.stepIndex,
    stepsTotal: session.steps.length,
    step: step ? { title: step.title, files: step.files } : null,
    bugs: session.bugs,
    found: session.found,
    fixed: session.fixed,
    restored: manifest.bugs.filter((b) => b.restored === true).length,
    score: session.score,
    stale: isSessionStale(session),
    idleMs: sessionIdleMs(session),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  });
}
function parseSteps(json) {
  let value;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`--steps is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(value) || value.length === 0) throw new Error("--steps must be a non-empty JSON array");
  return value.map((item, i) => {
    if (typeof item === "string") {
      if (item === "") throw new Error(`steps[${i}] is an empty title`);
      return { title: item, files: [] };
    }
    if (typeof item !== "object" || item === null) throw new Error(`steps[${i}] is not a string or object`);
    const record = item;
    if (typeof record["title"] !== "string" || record["title"] === "") throw new Error(`steps[${i}] has no title`);
    const files = record["files"] ?? [];
    if (!Array.isArray(files) || files.some((f) => typeof f !== "string")) throw new Error(`steps[${i}].files is not a string list`);
    const step = { title: record["title"], files };
    if (typeof record["check"] === "string") step.check = record["check"];
    return step;
  });
}
function cmdPlan(args) {
  const opts = flags(args, ["steps"]);
  if (opts === null || opts["steps"] === void 0) return usageError(`plan: ${USAGE.split("\n")[2].trim()}`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase !== "clarify") {
    return report(1, { status: "bad-phase", phase: session.phase, message: `plan runs in clarify, not ${session.phase}` });
  }
  let steps;
  try {
    steps = parseSteps(opts["steps"]);
  } catch (error) {
    return usageError(`plan: ${error.message}`);
  }
  session.steps = steps;
  session.stepIndex = 0;
  session.phase = "implementing";
  appendEvent(active.dir, { type: "planned", steps: steps.length });
  save(active);
  return report(0, { status: "ok", phase: session.phase, steps: steps.length });
}
function cmdInject(args) {
  const opts = flags(args, ["file", "line", "kind"]);
  if (opts === null || opts["file"] === void 0 || opts["line"] === void 0 || opts["kind"] === void 0) {
    return usageError(`inject: ${USAGE.split("\n")[3].trim()}`);
  }
  if (!MUTATION_KINDS.includes(opts["kind"])) {
    return usageError(`inject: unknown kind ${JSON.stringify(opts["kind"])} (kinds: ${MUTATION_KINDS.join(", ")})`);
  }
  const kind = opts["kind"];
  const line = Number(opts["line"]);
  if (!Number.isInteger(line)) return usageError(`inject: --line must be a positive integer, got ${JSON.stringify(opts["line"])}`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase !== "implementing" && session.phase !== "hunting") {
    return report(1, { status: "bad-phase", phase: session.phase, message: `inject runs in implementing or hunting, not ${session.phase}` });
  }
  let target;
  try {
    target = repoFile(opts["file"]);
  } catch (error) {
    return report(1, { status: "error", message: error.message });
  }
  if (languageOf(target.rel) === null) {
    return report(1, { status: "error", message: `${target.rel}: bugs are seeded in JavaScript, TypeScript and Java files only` });
  }
  const pristineText = readFileSync3(target.abs, "utf8");
  let mutation;
  try {
    assertWritable(root, target.abs);
    mutation = mutateFile(target.abs, line, kind);
  } catch (error) {
    return report(1, { status: "error", file: target.rel, message: error.message });
  }
  const bug = {
    id: `bug-${manifest.bugs.length + 1}`,
    step: session.stepIndex,
    file: target.rel,
    region: mutation.region,
    kind,
    pristineHunk: mutation.pristineHunk,
    buggyHunk: mutation.buggyHunk,
    twins: hunkCount(pristineText, mutation.buggyHunk),
    found: false,
    fixed: false,
    hints: []
  };
  manifest.bugs.push(bug);
  session.bugs = manifest.bugs.length;
  session.phase = "hunting";
  appendEvent(active.dir, { type: "injected", bug: bug.id, step: bug.step });
  save(active);
  return report(0, { status: "ok", bug: bug.id, file: bug.file, region: bug.region, kind, phase: session.phase, bugs: session.bugs });
}
function cmdReport(args) {
  const opts = flags(args, ["file"]);
  if (opts === null || opts["file"] === void 0) return usageError(`report: ${USAGE.split("\n")[5].trim()}`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  const rel = looseRel(opts["file"]);
  const bug = rel === null ? void 0 : manifest.bugs.find((b) => b.file === rel && !b.found && !b.fixed && b.restored !== true);
  if (bug === void 0) {
    return report(1, { status: "miss", file: opts["file"], message: `${opts["file"]} holds no unreported seeded bug` });
  }
  bug.found = true;
  session.found = manifest.bugs.filter((b) => b.found).length;
  appendEvent(active.dir, { type: "found", bug: bug.id });
  save(active);
  return report(0, { status: "found", bug: bug.id, found: session.found, bugs: session.bugs });
}
function cmdHint(args) {
  const opts = flags(args, ["level", "bug", "file"]);
  if (opts === null || opts["level"] === void 0) return usageError(`hint: ${USAGE.split("\n")[6].trim()}`);
  const level = Number(opts["level"]);
  if (!HINT_LEVELS.includes(level)) return usageError(`hint: --level must be 1, 2 or 3`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  const live = (b) => !b.fixed && b.restored !== true;
  let bug;
  if (opts["bug"] !== void 0) {
    bug = manifest.bugs.find((b) => b.id === opts["bug"]);
    if (bug === void 0) return report(1, { status: "no-bug", message: `unknown bug ${JSON.stringify(opts["bug"])}` });
    if (!live(bug)) return report(1, { status: "no-bug", bug: bug.id, message: `${bug.id} is already ${bug.fixed ? "fixed" : "restored"}` });
  } else if (opts["file"] !== void 0) {
    const rel = looseRel(opts["file"]);
    bug = rel === null ? void 0 : manifest.bugs.find((b) => b.file === rel && live(b));
    if (bug === void 0) return report(1, { status: "no-bug", file: opts["file"], message: `${opts["file"]} holds no unfixed seeded bug` });
  } else {
    bug = manifest.bugs.find((b) => b.step === session.stepIndex && live(b));
    if (bug === void 0) return report(1, { status: "no-bug", message: "no unfixed bug to hint" });
  }
  bug.hints.push(level);
  session.score = scoreSession(manifest);
  appendEvent(active.dir, { type: "hint", bug: bug.id, level, cost: HINT_COST[level] });
  save(active);
  return report(0, { status: "ok", bug: bug.id, level, score: session.score });
}
function fileParses(abs) {
  if (!NODE_CHECKABLE.test(abs)) return { ok: true };
  const check = spawnSync2(process.execPath, ["--check", abs], { encoding: "utf8" });
  if (check.status === 0) return { ok: true };
  return { ok: false, message: (check.stderr || check.stdout || "syntax error").trim().split("\n")[0] };
}
function cmdVerify(args) {
  const opts = flags(args, ["check-exit"]);
  if (opts === null) return usageError(`verify: ${USAGE.split("\n")[7].trim()}`);
  const checkExit = opts["check-exit"] === void 0 ? void 0 : Number(opts["check-exit"]);
  if (checkExit !== void 0 && !Number.isInteger(checkExit)) return usageError("verify: --check-exit takes the check command's integer exit code");
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase === "done") return report(0, { status: "ok", phase: session.phase, stepIndex: session.stepIndex });
  if (session.phase === "clarify") {
    return report(1, { status: "bad-phase", phase: session.phase, message: "nothing to verify before `plan`" });
  }
  const pending = manifest.bugs.filter((b) => !b.fixed && b.restored !== true);
  const newlyFixed = [];
  for (const bug of pending) {
    const abs = join4(root, bug.file);
    if (!existsSync2(abs)) return report(1, { status: "error", file: bug.file, message: `${bug.file} no longer exists \u2014 restore the file and try again` });
    const text = readFileSync3(abs, "utf8");
    if (bugStillPresent(text, bug)) continue;
    const parsed = fileParses(abs);
    if (!parsed.ok) return report(1, { status: "unparseable", file: bug.file, bug: bug.id, message: parsed.message });
    bug.fixed = true;
    newlyFixed.push(bug.id);
    appendEvent(active.dir, { type: "fixed", bug: bug.id });
  }
  session.fixed = manifest.bugs.filter((b) => b.fixed).length;
  const remaining = pending.length - newlyFixed.length;
  if (remaining > 0) {
    session.score = scoreSession(manifest);
    save(active);
    return report(1, { status: "still-buggy", remaining, fixed: newlyFixed });
  }
  if (checkExit !== void 0 && checkExit !== 0) {
    session.score = scoreSession(manifest);
    save(active);
    return report(1, { status: "check-failed", exitCode: checkExit, reportedBy: "agent" });
  }
  const step = session.stepIndex;
  appendEvent(active.dir, checkExit === void 0 ? { type: "verified", step } : { type: "verified", step, checkExit, reportedBy: "agent" });
  session.stepIndex += 1;
  session.phase = session.stepIndex >= session.steps.length ? "done" : "implementing";
  session.score = scoreSession(manifest);
  save(active);
  return report(0, { status: "ok", phase: session.phase, stepIndex: session.stepIndex, step, fixed: newlyFixed });
}
function cmdComplete(args) {
  if (args.length !== 0) return usageError(`complete: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase !== "done") {
    const remaining = manifest.bugs.filter((b) => !b.fixed && b.restored !== true).length;
    return report(1, { status: "not-complete", phase: session.phase, remaining, message: `phase is ${session.phase}; verify every step first` });
  }
  session.score = scoreSession(manifest);
  appendEvent(active.dir, { type: "completed", score: session.score });
  dropPristineSnapshots(manifest);
  save(active);
  unlinkSync2(join4(root, SUSTAIN_DIR, ACTIVE_FILE));
  return report(0, { status: "completed", score: session.score, found: session.found, fixed: session.fixed, bugs: session.bugs, run: `${SUSTAIN_DIR}/${active.run}` });
}
function cmdPause(args) {
  if (args.length !== 0) return usageError(`pause: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session } = active;
  if (session.phase === "paused") return report(1, { status: "paused", phase: "paused", message: "session is already paused" });
  if (session.phase === "done") return report(1, { status: "bad-phase", phase: "done", message: "a finished session cannot pause \u2014 run `complete`" });
  const from = session.phase;
  session.pausedFrom = from;
  session.phase = "paused";
  appendEvent(active.dir, { type: "paused", from });
  save(active);
  return report(0, { status: "ok", phase: "paused", pausedFrom: from });
}
function cmdResume(args) {
  if (args.length !== 0) return usageError(`resume: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session } = active;
  if (session.phase !== "paused") {
    return report(1, { status: "bad-phase", phase: session.phase, message: `resume runs while paused, not ${session.phase}` });
  }
  const to = session.pausedFrom ?? "implementing";
  delete session.pausedFrom;
  session.phase = to;
  appendEvent(active.dir, { type: "resumed", to });
  save(active);
  return report(0, { status: "ok", phase: to });
}
function restoreSeededBugs(runDir, bugs) {
  const result = { restored: [], fixed: [], missing: [], unrestorable: [] };
  for (const bug of bugs) {
    const abs = join4(root, bug.file);
    if (!existsSync2(abs)) {
      bug.restored = true;
      result.missing.push(bug.id);
      continue;
    }
    const text = readFileSync3(abs, "utf8");
    if (!bugStillPresent(text, bug)) {
      bug.fixed = true;
      appendEvent(runDir, { type: "fixed", bug: bug.id });
      result.fixed.push(bug.id);
      continue;
    }
    const pristine = bug.pristineHunk;
    if (pristine === void 0) {
      result.unrestorable.push(bug.id);
      continue;
    }
    const next = restoreHunk(text, { ...bug, pristineHunk: pristine });
    if (next === null) continue;
    assertWritable(root, abs);
    writeFileSync2(abs, next);
    bug.restored = true;
    result.restored.push(bug.id);
  }
  return result;
}
function dropPristineSnapshots(manifest) {
  for (const bug of manifest.bugs) delete bug.pristineHunk;
}
function seededBugs(manifest) {
  return manifest.bugs.filter((b) => !b.fixed && b.restored !== true);
}
function cmdRestore(args) {
  const opts = flags(args, ["bug"]);
  if (opts === null) return usageError(`restore: [--bug <id>]`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  if (session.phase === "done") {
    return report(1, { status: "bad-phase", phase: "done", message: "the session is finished \u2014 nothing left to restore" });
  }
  let targets = seededBugs(manifest);
  if (opts["bug"] !== void 0) {
    targets = targets.filter((b) => b.id === opts["bug"]);
    if (targets.length === 0) return report(1, { status: "no-bug", bug: opts["bug"], message: `no seeded bug ${JSON.stringify(opts["bug"])} to restore` });
  }
  const result = restoreSeededBugs(active.dir, targets);
  session.fixed = manifest.bugs.filter((b) => b.fixed).length;
  session.score = scoreSession(manifest);
  appendEvent(active.dir, { type: "restored", ...result });
  save(active);
  return report(0, { status: "ok", phase: session.phase, ...result });
}
function cmdAbandon(args) {
  if (args.length !== 0) return usageError(`abandon: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const result = restoreSeededBugs(active.dir, seededBugs(manifest));
  session.fixed = manifest.bugs.filter((b) => b.fixed).length;
  session.score = scoreSession(manifest);
  session.phase = "done";
  delete session.pausedFrom;
  appendEvent(active.dir, { type: "abandoned", ...result, score: session.score });
  dropPristineSnapshots(manifest);
  save(active);
  unlinkSync2(join4(root, SUSTAIN_DIR, ACTIVE_FILE));
  return report(0, { status: "abandoned", score: session.score, ...result, run: `${SUSTAIN_DIR}/${active.run}` });
}
var COMMANDS = {
  init: cmdInit,
  status: cmdStatus,
  plan: cmdPlan,
  inject: cmdInject,
  report: cmdReport,
  hint: cmdHint,
  verify: cmdVerify,
  complete: cmdComplete,
  pause: cmdPause,
  resume: cmdResume,
  restore: cmdRestore,
  abandon: cmdAbandon
};
function main(args) {
  const command = args[0];
  if (command === void 0) return usageError(USAGE);
  const handler = COMMANDS[command];
  if (handler === void 0) return usageError(`unknown command ${JSON.stringify(command)}
${USAGE}`);
  try {
    return handler(args.slice(1));
  } catch (error) {
    return usageError(`${command}: ${error.message}`);
  }
}
process.exitCode = main(process.argv.slice(2));
