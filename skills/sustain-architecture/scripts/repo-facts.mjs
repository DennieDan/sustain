// src/agent/repo-facts.ts
import { basename as basename2, join as join5 } from "node:path";

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
  const allDirty = parsePorcelainZ(run(program, root, GIT_READS.status) ?? "");
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
  const parent = join2(root, dir);
  mkdirSync(parent, { recursive: true });
  const parentReal = realpathSync2(parent);
  if (!isInside(realpathSync2(root), parentReal) || !statSync2(parentReal).isDirectory()) {
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

// src/model/runRecord.ts
import { join as join4 } from "node:path";

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
function assertWritable(root, path) {
  const rootReal = realpathSync3(root);
  let ancestor = dirname2(path);
  while (lstatOrNull(ancestor) === null && dirname2(ancestor) !== ancestor) ancestor = dirname2(ancestor);
  let ancestorReal;
  try {
    ancestorReal = realpathSync3(ancestor);
  } catch {
    throw new Error(`${path} would be written through a broken link at ${ancestor}`);
  }
  if (!isWithin(rootReal, ancestorReal)) throw new Error(`${path} would be written outside ${root}`);
  assertNotLink(path);
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
var STALE_IDLE_MS = 24 * 60 * 60 * 1e3;
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

// src/model/runRecord.ts
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
function writeRunRecord(root, runDir, record) {
  const path = join4(runDir, RUN_FILE);
  assertWritable(root, path);
  writeJson(path, record);
}

// src/agent/repo-facts.ts
var SKILL_VERSION = "0.2.0";
function main(args) {
  let focus = "";
  if (args.length === 2 && args[0] === "--focus") focus = args[1];
  else if (args.length !== 0) {
    process.stderr.write("repo-facts.mjs: usage: node repo-facts.mjs [--focus <text>]\n");
    return 2;
  }
  const root = process.cwd();
  const git = collectGitFacts(root);
  let run2;
  try {
    run2 = createRunFolder(root, slugify(focus, basename2(root)), runTimestamp(/* @__PURE__ */ new Date()));
    writeRunRecord(root, join5(root, ARCHIFY_DIR, run2), newRunRecord({ focus, skillVersion: SKILL_VERSION }));
  } catch (error) {
    process.stderr.write(`repo-facts.mjs: ${error.message}
`);
    return 2;
  }
  const facts = {
    root,
    runFolder: `${ARCHIFY_DIR}/${run2}`,
    draft: `${ARCHIFY_DIR}/${run2}/${DRAFT_FILE}`,
    git: git && { head: git.head, origin: git.origin, dirtyCount: git.dirtyCount, dirty: git.dirty }
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}
`);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
