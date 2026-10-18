// src/agent/refresh-facts.ts
import { readdirSync as readdirSync2, readFileSync as readFileSync4, realpathSync as realpathSync3, statSync as statSync3, writeFileSync } from "node:fs";
import { basename as basename2, join as join6 } from "node:path";

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

// src/model/runRecord.ts
import { readdirSync, readFileSync as readFileSync3 } from "node:fs";
import { join as join5 } from "node:path";
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
    const value = JSON.parse(readFileSync3(join5(runDir, RUN_FILE), "utf8"));
    return isJsonObject(value) && value["schema"] === 1 && typeof value["phase"] === "string" ? value : null;
  } catch {
    return null;
  }
}
function writeRunRecord(root, runDir, record) {
  const path = join5(runDir, RUN_FILE);
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
  return readdirSync2(root).filter((name) => !name.startsWith(".") && !NOT_SOURCE.has(name)).filter((name) => {
    try {
      return statSync3(join6(root, name)).isDirectory();
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
  const baseDir = join6(root, ARCHIFY_DIR, base);
  let doc;
  try {
    const candidate = join6(baseDir, CANDIDATE_FILE);
    if (!isWithin(realpathSync3(root), realpathSync3(candidate))) return fail(`${ARCHIFY_DIR}/${base}/${CANDIDATE_FILE} lies outside the repository`);
    doc = JSON.parse(readFileSync4(candidate, "utf8"));
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
    const runDir = join6(root, ARCHIFY_DIR, run2);
    writeRunRecord(root, runDir, newRunRecord({ kind: "refresh", focus, paths: parsed.paths, base, skillVersion: SKILL_VERSION }));
    const draft = join6(runDir, DRAFT_FILE);
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
    newFolders: report.newFolders
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}
`);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
