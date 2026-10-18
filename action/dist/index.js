"use strict";

// action/src/index.ts
var import_node_fs6 = require("node:fs");

// action/src/github.ts
function restClient(api, repository, token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  const call = async (method, path2, body) => {
    const response = await fetch(`${api}/repos/${repository}${path2}`, { method, headers, ...body === void 0 ? {} : { body: JSON.stringify(body) } });
    if (!response.ok) throw new Error(`GitHub ${method} ${path2}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  return {
    async listComments(issue) {
      const comments = [];
      for (let page = 1; ; page++) {
        const batch = await call("GET", `/issues/${issue}/comments?per_page=100&page=${page}`);
        comments.push(...batch);
        if (batch.length < 100) return comments;
      }
    },
    async createComment(issue, body) {
      await call("POST", `/issues/${issue}/comments`, { body });
    },
    async updateComment(id, body) {
      await call("PATCH", `/issues/comments/${id}`, { body });
    }
  };
}

// src/model/check.ts
var import_node_fs5 = require("node:fs");
var import_node_path5 = require("node:path");

// src/model/changes.ts
var REVISION_PATTERN = /^(?!-)[A-Za-z0-9._/~^@{}-]+$/;
function unquotePath(raw) {
  if (!raw.startsWith('"')) return raw;
  const bytes = [];
  const escapes = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
  for (let i = 1; i < raw.length - 1; i++) {
    const char = raw[i];
    if (char !== "\\") {
      bytes.push(...new TextEncoder().encode(char));
      continue;
    }
    const next = raw[i + 1];
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(raw.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(escapes[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
function headerPaths(rest) {
  let oldRaw;
  let newRaw;
  if (rest.startsWith('"')) {
    const end = /^"(?:[^"\\]|\\.)*"/.exec(rest)?.[0] ?? rest;
    oldRaw = end;
    newRaw = rest.slice(end.length + 1);
  } else {
    const split = Math.max(rest.lastIndexOf(" b/"), rest.lastIndexOf(' "b/'));
    oldRaw = split < 0 ? rest : rest.slice(0, split);
    newRaw = split < 0 ? rest : rest.slice(split + 1);
  }
  const strip = (raw, prefix) => {
    const path2 = unquotePath(raw);
    return path2.startsWith(prefix) ? path2.slice(prefix.length) : path2;
  };
  return [strip(oldRaw, "a/"), strip(newRaw, "b/")];
}
function sidePath(line, prefix) {
  const raw = unquotePath(line.slice(4).replace(/\t$/, ""));
  if (raw === "/dev/null") return null;
  return raw.startsWith(prefix) ? raw.slice(2) : raw;
}
function parseDiff(text) {
  const files = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const [oldPath, path2] = headerPaths(line.slice("diff --git ".length));
      current = { path: path2, oldPath, status: "modified", hunks: [] };
      files.push(current);
    } else if (current === null) {
      continue;
    } else if (line.startsWith("rename from ")) {
      current.oldPath = unquotePath(line.slice("rename from ".length));
      current.status = "renamed";
    } else if (line.startsWith("rename to ")) {
      current.path = unquotePath(line.slice("rename to ".length));
    } else if (line.startsWith("new file mode")) {
      current.status = "added";
    } else if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
    } else if (line.startsWith("--- ")) {
      const old = sidePath(line, "a/");
      if (old !== null) current.oldPath = old;
    } else if (line.startsWith("+++ ")) {
      const next = sidePath(line, "b/");
      if (next !== null) current.path = next;
      else current.path = current.oldPath;
    } else if (line.startsWith("@@ ")) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
      if (hunk) {
        current.hunks.push({ oldStart: Number(hunk[1]), oldLines: hunk[2] === void 0 ? 1 : Number(hunk[2]) });
        current.added = (current.added ?? 0) + (hunk[3] === void 0 ? 1 : Number(hunk[3]));
      }
    }
  }
  return files;
}
function touches(hunk, start, end) {
  if (hunk.oldLines === 0) return hunk.oldStart >= start && hunk.oldStart < end;
  return hunk.oldStart <= end && hunk.oldStart + hunk.oldLines - 1 >= start;
}
function sourceTouched(source, change) {
  if (source.line === void 0) return true;
  if (change.hunks.length === 0) return change.status !== "renamed";
  return change.hunks.some((hunk) => touches(hunk, source.line, source.end_line ?? source.line));
}
function markChanges(components, changes) {
  const byOldPath = new Map(changes.map((change) => [change.oldPath, change]));
  const cited = /* @__PURE__ */ new Set();
  const strong = [];
  const weak = [];
  for (const component of components) {
    let mark = null;
    for (const source of component.sources) {
      const change = byOldPath.get(source.path);
      cited.add(source.path);
      if (change === void 0) continue;
      if (sourceTouched(source, change)) mark = "strong";
      else mark ??= "weak";
    }
    if (mark === "strong") strong.push(component.id);
    else if (mark === "weak") weak.push(component.id);
  }
  const uncovered = changes.filter((change) => !cited.has(change.oldPath) && !cited.has(change.path)).map((change) => change.path);
  return { strong, weak, uncovered };
}

// src/model/types.ts
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/model/config.ts
var CONFIG_FILE = "sustain.config.json";
var FAIL_ON = ["stale", "new-box"];
function strings(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function readConfig(value) {
  if (!isJsonObject(value)) return { ok: false, errors: ["the config must be a JSON object"] };
  const errors = [];
  for (const key of Object.keys(value)) if (!["map", "ignore", "check", "rules"].includes(key)) errors.push(`unknown key "${key}"`);
  if (value["map"] !== void 0 && (typeof value["map"] !== "string" || !/^[a-z0-9]+-[A-Za-z0-9._-]+$/.test(value["map"]))) errors.push('"map" must name a run folder in .archify/');
  if (value["ignore"] !== void 0 && !strings(value["ignore"])) errors.push('"ignore" must be a list of globs');
  if (value["rules"] !== void 0 && !Array.isArray(value["rules"])) errors.push('"rules" must be a list');
  const check = value["check"];
  if (check !== void 0) {
    if (!isJsonObject(check)) errors.push('"check" must be an object');
    else {
      for (const key of Object.keys(check)) if (key !== "failOn") errors.push(`unknown key "check.${key}"`);
      const failOn = check["failOn"];
      if (failOn !== void 0 && !(strings(failOn) && failOn.every((entry) => FAIL_ON.includes(entry)))) {
        errors.push(`"check.failOn" may list only ${FAIL_ON.join(", ")}`);
      }
    }
  }
  return errors.length === 0 ? { ok: true, config: value } : { ok: false, errors };
}

// src/model/ownership.ts
var Ownership = class {
  byFile = /* @__PURE__ */ new Map();
  byDir = /* @__PURE__ */ new Map();
  /** Every directory with a cited file somewhere below it. */
  citedBelow = /* @__PURE__ */ new Set();
  constructor(components) {
    for (const component of components) {
      for (const source of component.sources ?? []) {
        add(this.byFile, source.path, component.id);
        const dir = dirOf(source.path);
        add(this.byDir, dir, component.id);
        for (let up = dir; ; up = dirOf(up)) {
          this.citedBelow.add(up);
          if (up === "") break;
        }
      }
    }
  }
  /** The boxes that own `path`, nearest first; empty when none does. */
  owners(path2) {
    const direct = this.byFile.get(path2);
    if (direct) return [...direct];
    for (let dir = dirOf(path2); ; dir = dirOf(dir)) {
      const boxes = this.byDir.get(dir);
      if (boxes) return [...boxes];
      if (dir === "") return [];
    }
  }
  /** Whether some box cites a file in `dir` or below it. */
  ownsBelow(dir) {
    return this.citedBelow.has(dir);
  }
};
function dirOf(path2) {
  const slash = path2.lastIndexOf("/");
  return slash < 0 ? "" : path2.slice(0, slash);
}
function add(map, key, id) {
  const set = map.get(key) ?? /* @__PURE__ */ new Set();
  set.add(id);
  map.set(key, set);
}

// src/model/delta.ts
var CANDIDATE_LINES = 200;
var CANDIDATE_FILES = 3;
var SOURCE_EXTENSIONS = new Set(
  "ts tsx js jsx mjs cjs py go rs java kt kts scala rb php cs fs c h cc cpp cxx hpp m mm swift dart lua sh sql vue svelte ex exs erl hs clj elm zig nim r jl".split(" ")
);
function isSourceFile(path2) {
  if (path2.startsWith(".archify/")) return false;
  const dot = path2.lastIndexOf(".");
  return dot > path2.lastIndexOf("/") && SOURCE_EXTENSIONS.has(path2.slice(dot + 1).toLowerCase());
}
function isTestFile(path2) {
  return /(^|\/)(test|tests|__tests__|spec|specs)\//.test(path2) || /\.(test|spec)\.[^./]+$/.test(path2) || /_test\.[^./]+$/.test(path2) || /(^|\/)test_[^/]+$/.test(path2);
}
function commonDir(paths) {
  let dir = dirOf(paths[0]);
  for (const path2 of paths) while (dir !== "" && path2 !== dir && !path2.startsWith(`${dir}/`)) dir = dirOf(dir);
  return dir;
}
function deltaReport(inputs) {
  const label = new Map(inputs.components.map((component) => [component.id, component.label]));
  const ref = (id) => ({ id, label: label.get(id) ?? id });
  const marks = markChanges(
    inputs.components.map((component) => ({ id: component.id, sources: component.sources ?? [] })),
    inputs.changes
  );
  const byBox = /* @__PURE__ */ new Map();
  for (const citation of inputs.freshness.citations) byBox.set(citation.component, [...byBox.get(citation.component) ?? [], citation.state]);
  const gone = [...byBox].filter(([, states]) => states.every((state) => state === "missing")).map(([id]) => id);
  const stale = Object.entries(inputs.freshness.boxes).filter(([id, state]) => (state === "edited" || state === "missing") && !gone.includes(id)).map(([id, state]) => ({ ...ref(id), state }));
  const ownership = new Ownership(inputs.components);
  const ignored = (path2) => inputs.ignore.some((glob) => glob.test(path2));
  const uncoveredChanges = inputs.changes.filter(
    (change) => change.status !== "deleted" && isSourceFile(change.path) && !ignored(change.path) && ownership.owners(change.path).length === 0
  );
  const groups = /* @__PURE__ */ new Map();
  for (const change of uncoveredChanges) {
    let key = dirOf(change.path);
    while (key !== "" && !ownership.ownsBelow(dirOf(key)) && dirOf(key) !== "") key = dirOf(key);
    groups.set(key, [...groups.get(key) ?? [], change]);
  }
  const candidates = [];
  for (const members of groups.values()) {
    const dir = commonDir(members.map((change) => change.path));
    const lines = members.filter((change) => !isTestFile(change.path)).reduce((sum, change) => sum + (change.added ?? 0), 0);
    const fresh = !inputs.existedAtBase(dir) && (inputs.sourceFilesIn(dir) >= CANDIDATE_FILES || lines >= CANDIDATE_LINES);
    const grown = !ownership.ownsBelow(dir) && lines >= CANDIDATE_LINES;
    if (dir !== "" && (fresh || grown)) {
      candidates.push({
        dir,
        files: members.map((change) => ({ path: change.path, added: change.added ?? 0 })).sort((a, b) => a.path.localeCompare(b.path)),
        lines,
        label: dir.slice(dir.lastIndexOf("/") + 1)
      });
    }
  }
  return {
    touched: { strong: marks.strong.map(ref), weak: marks.weak.map(ref) },
    stale,
    uncovered: uncoveredChanges.map((change) => change.path).sort(),
    candidates: candidates.sort((a, b) => a.dir.localeCompare(b.dir)),
    gone: gone.map(ref)
  };
}
function verdict(report, failOn) {
  const reasons = [];
  if (failOn.includes("stale") && report.stale.length + report.gone.length > 0) reasons.push(`${report.stale.length + report.gone.length} stale or gone box(es)`);
  if (failOn.includes("new-box") && report.candidates.length > 0) reasons.push(`${report.candidates.length} new box candidate(s)`);
  return { result: reasons.length === 0 ? "pass" : "fail", reasons };
}

// src/model/discovery.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/model/runFolder.ts
var ARCHIFY_DIR = ".archify";
var CANDIDATE_FILE = "candidate.json";
var RUN_NAME_PATTERN = /^([a-z0-9]+)-(.+)-(\d{8}-\d{6})(?:-(\d+))?$/;
function parseRunName(name) {
  const match = RUN_NAME_PATTERN.exec(name);
  if (!match) return null;
  return { prefix: match[1], slug: match[2], timestamp: match[3], n: match[4] === void 0 ? 1 : Number(match[4]) };
}
function parseRunFolderName(name) {
  const parsed = parseRunName(name);
  if (parsed === null || parsed.prefix !== "architecture") return null;
  return { slug: parsed.slug, timestamp: parsed.timestamp, n: parsed.n };
}

// src/model/discovery.ts
function compareCandidates(a, b) {
  const ra = parseRunFolderName(a.runFolder);
  const rb = parseRunFolderName(b.runFolder);
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  if (ra && rb) {
    if (ra.timestamp !== rb.timestamp) return ra.timestamp < rb.timestamp ? 1 : -1;
    if (ra.n !== rb.n) return rb.n - ra.n;
  } else if (a.mtimeMs !== b.mtimeMs) {
    return b.mtimeMs - a.mtimeMs;
  }
  return a.runFolder < b.runFolder ? 1 : a.runFolder > b.runFolder ? -1 : 0;
}
function listCandidates(root) {
  let rootReal;
  let folders;
  try {
    rootReal = (0, import_node_fs.realpathSync)(root);
    folders = (0, import_node_fs.readdirSync)((0, import_node_path.join)(root, ARCHIFY_DIR));
  } catch {
    return [];
  }
  const candidates = [];
  for (const runFolder of folders) {
    const file = (0, import_node_path.join)(root, ARCHIFY_DIR, runFolder, CANDIDATE_FILE);
    try {
      const real = (0, import_node_fs.realpathSync)(file);
      if (!real.startsWith(rootReal + import_node_path.sep)) continue;
      const stat = (0, import_node_fs.statSync)(real);
      if (stat.isFile()) candidates.push({ runFolder, file, mtimeMs: stat.mtimeMs });
    } catch {
    }
  }
  return candidates.sort(compareCandidates);
}

// src/model/git.ts
var import_node_child_process = require("node:child_process");

// src/model/which.ts
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
function isExecutableFile(path2, platform) {
  try {
    if (!(0, import_node_fs2.statSync)(path2).isFile()) return false;
    if (platform !== "win32") (0, import_node_fs2.accessSync)(path2, import_node_fs2.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function findOnPath(cli, env, platform = process.platform) {
  const pathValue = env["PATH"] ?? env["Path"] ?? "";
  const extensions = platform === "win32" ? ["", ...(env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)] : [""];
  const absolute = platform === "win32" ? import_node_path2.win32.isAbsolute : import_node_path2.posix.isAbsolute;
  for (const dir of pathValue.split(platform === "win32" ? ";" : import_node_path2.delimiter)) {
    if (!absolute(dir)) continue;
    for (const extension of extensions) {
      const candidate = (0, import_node_path2.join)(dir, cli + extension);
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
  const result = (0, import_node_child_process.spawnSync)(program, argv, {
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
var DIFF_FLAGS = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--unified=0", "-M", "--src-prefix=a/", "--dst-prefix=b/"];
function untrackedFiles(root, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0) return [];
  return (run(program, root, [...GIT_PREFIX, "ls-files", "--others", "--exclude-standard", "-z"]) ?? "").split("\0").filter((path2) => path2 !== "");
}
function mergeBase(root, a, b, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0 || !REVISION_PATTERN.test(a) || !REVISION_PATTERN.test(b)) return null;
  return run(program, root, [...GIT_PREFIX, "merge-base", a, b])?.trim() || null;
}
function diffBetween(root, from, to, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0 || ![from, ...to === null ? [] : [to]].every((revision) => REVISION_PATTERN.test(revision))) return null;
  return run(program, root, [...GIT_PREFIX, ...DIFF_FLAGS, from, ...to === null ? [] : [to], "--"]);
}
function fileAt(root, revision, path2, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0 || !REVISION_PATTERN.test(revision) || path2.startsWith("-") || path2.includes(":")) return null;
  return runRaw(program, root, [...GIT_PREFIX, "cat-file", "blob", `${revision}:${path2}`]);
}
function existsAt(root, revision, path2, env = process.env) {
  if (path2 === "") return true;
  const program = gitProgram(env);
  if (program === void 0 || !REVISION_PATTERN.test(revision) || path2.startsWith("-") || path2.includes(":")) return false;
  return run(program, root, [...GIT_PREFIX, "cat-file", "-e", `${revision}:${path2}`]) !== null;
}
function filesAt(root, revision, dir, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0 || !REVISION_PATTERN.test(revision)) return [];
  const output = run(program, root, [...GIT_PREFIX, "ls-tree", "-r", "-z", "--name-only", revision, "--", dir === "" ? "." : dir]);
  return (output ?? "").split("\0").filter((path2) => path2 !== "");
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

// src/model/runRecord.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");

// src/model/session.ts
var STALE_IDLE_MS = 24 * 60 * 60 * 1e3;

// src/model/runRecord.ts
var RUN_FILE = "run.json";
function readRunRecord(runDir) {
  try {
    const value = JSON.parse((0, import_node_fs3.readFileSync)((0, import_node_path3.join)(runDir, RUN_FILE), "utf8"));
    return isJsonObject(value) && value["schema"] === 1 && typeof value["phase"] === "string" ? value : null;
  } catch {
    return null;
  }
}

// src/model/staleness.ts
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");

// src/model/fingerprints.ts
var import_node_crypto = require("node:crypto");
var FINGERPRINTS_FILE = "fingerprints.json";
function gitBlobId(bytes) {
  return (0, import_node_crypto.createHash)("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function normalizedLines(text) {
  return text.split("\n").map((line) => line.trimEnd());
}
function hashLines(lines) {
  return (0, import_node_crypto.createHash)("sha256").update(lines.join("\n")).digest("hex");
}
function looseLines(lines) {
  return lines.map((line) => line.trimStart());
}

// src/model/staleness.ts
var ORDER = ["fresh", "unknown", "moved", "edited", "missing"];
function readFingerprints(runDir) {
  try {
    const value = JSON.parse((0, import_node_fs4.readFileSync)((0, import_node_path4.join)(runDir, FINGERPRINTS_FILE), "utf8"));
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
  const moved = (path2, line) => ({
    ...base,
    state: "moved",
    now: line === void 0 ? { path: path2 } : { path: path2, line, ...size > 0 ? { end_line: line + size } : {} }
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
  return (path2) => {
    try {
      return (0, import_node_fs4.readFileSync)((0, import_node_path4.join)(root, ...path2.split("/")));
    } catch {
      return null;
    }
  };
}

// src/model/tolerant.ts
var COMPONENT_TYPES = ["frontend", "backend", "database", "cloud", "security", "messagebus", "external"];
var VARIANTS = ["default", "emphasis", "security", "dashed"];
function isObj(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value) {
  return typeof value === "string" ? value : void 0;
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function pair(value) {
  if (!Array.isArray(value) || value.length !== 2) return void 0;
  const [a, b] = [num(value[0]), num(value[1])];
  return a === void 0 || b === void 0 ? void 0 : [a, b];
}
function readSources(value, pointer, skipped) {
  if (!Array.isArray(value)) return [];
  const sources = [];
  value.forEach((entry, k) => {
    const path2 = isObj(entry) ? str(entry["path"]) : void 0;
    if (!isObj(entry) || path2 === void 0) {
      skipped.push(`${pointer}/sources/${k}: no string path`);
      return;
    }
    const source = { path: path2 };
    const line = num(entry["line"]);
    const end = num(entry["end_line"]);
    const label = str(entry["label"]);
    if (line !== void 0) source.line = line;
    if (end !== void 0) source.end_line = end;
    if (label !== void 0) source.label = label;
    sources.push(source);
  });
  return sources;
}
function readGrid(value) {
  if (!isObj(value) || value["mode"] !== "grid") return void 0;
  const grid = { mode: "grid" };
  const origin = pair(value["origin"]);
  if (origin) grid.origin = origin;
  for (const key of ["cols", "gapX", "gapY", "cellW", "cellH"]) {
    const n = num(value[key]);
    if (n !== void 0) grid[key] = n;
  }
  return grid;
}
function readDiagram(value) {
  if (!isObj(value)) return { ok: false, reason: "the root is not a JSON object" };
  const rawComponents = value["components"];
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    return { ok: false, reason: "it has no components" };
  }
  const skipped = [];
  const components = [];
  const ids = /* @__PURE__ */ new Set();
  rawComponents.forEach((raw, i) => {
    const pointer = `/components/${i}`;
    const id = isObj(raw) ? str(raw["id"]) : void 0;
    if (!isObj(raw) || id === void 0) {
      skipped.push(`${pointer}: no string id`);
      return;
    }
    if (ids.has(id)) {
      skipped.push(`${pointer}: duplicate id ${id}`);
      return;
    }
    ids.add(id);
    const type = str(raw["type"]);
    const component = {
      id,
      label: str(raw["label"]) || id,
      type: COMPONENT_TYPES.includes(type) ? type : "external",
      sources: readSources(raw["sources"], pointer, skipped)
    };
    const sublabel = str(raw["sublabel"]);
    const tag = str(raw["tag"]);
    const pos = pair(raw["pos"]);
    const size = pair(raw["size"]);
    const row = num(raw["row"]);
    const col = num(raw["col"]);
    if (sublabel) component.sublabel = sublabel;
    if (tag) component.tag = tag;
    if (pos) component.pos = pos;
    if (size) component.size = size;
    if (row !== void 0) component.row = row;
    if (col !== void 0) component.col = col;
    components.push(component);
  });
  if (components.length === 0) return { ok: false, reason: "it has no components with an id" };
  const connections = [];
  const rawConnections = value["connections"];
  if (Array.isArray(rawConnections)) {
    rawConnections.forEach((raw, i) => {
      const from = isObj(raw) ? str(raw["from"]) : void 0;
      const to = isObj(raw) ? str(raw["to"]) : void 0;
      if (!isObj(raw) || from === void 0 || to === void 0 || !ids.has(from) || !ids.has(to)) {
        skipped.push(`/connections/${i}: from/to do not resolve`);
        return;
      }
      const variant = str(raw["variant"]);
      const connection = { from, to, variant: VARIANTS.includes(variant) ? variant : "default" };
      const label = str(raw["label"]);
      if (label) connection.label = label;
      connections.push(connection);
    });
  }
  const boundaries = [];
  const rawBoundaries = value["boundaries"];
  if (Array.isArray(rawBoundaries)) {
    rawBoundaries.forEach((raw, i) => {
      const pointer = `/boundaries/${i}`;
      if (!isObj(raw)) {
        skipped.push(`${pointer}: not an object`);
        return;
      }
      const wraps = [];
      const rawWraps = Array.isArray(raw["wraps"]) ? raw["wraps"] : [];
      rawWraps.forEach((member, j) => {
        if (typeof member === "string" && ids.has(member)) {
          if (!wraps.includes(member)) wraps.push(member);
        } else skipped.push(`${pointer}/wraps/${j}: does not resolve`);
      });
      if (wraps.length === 0) {
        skipped.push(`${pointer}: no members left`);
        return;
      }
      boundaries.push({ kind: raw["kind"] === "security-group" ? "security-group" : "region", label: str(raw["label"]) ?? "", wraps });
    });
  }
  const diagram = { components, connections, boundaries };
  const meta = value["meta"];
  const title = isObj(meta) ? str(meta["title"]) : void 0;
  if (title) diagram.title = title;
  const grid = readGrid(value["layout"]);
  if (grid) diagram.grid = grid;
  return { ok: true, diagram, skipped };
}

// src/model/check.ts
function loadConfig(root) {
  let text;
  try {
    text = (0, import_node_fs5.readFileSync)((0, import_node_path5.join)(root, CONFIG_FILE), "utf8");
  } catch {
    return { ok: true, config: {} };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `${CONFIG_FILE} is not valid JSON: ${error.message}` };
  }
  const result = readConfig(value);
  return result.ok ? result : { ok: false, reason: `${CONFIG_FILE}: ${result.errors.join("; ")}` };
}
function mainMap(root) {
  for (const candidate of listCandidates(root)) {
    if ((readRunRecord((0, import_node_path5.dirname)(candidate.file))?.focus ?? "") === "") return candidate.runFolder;
  }
  return null;
}
function countLines(bytes) {
  if (bytes.length === 0) return 0;
  const newlines = bytes.reduce((sum, byte) => sum + (byte === 10 ? 1 : 0), 0);
  return bytes[bytes.length - 1] === 10 ? newlines : newlines + 1;
}
function filesOnDisk(root, dir) {
  const out = [];
  const walk = (rel) => {
    let names;
    try {
      names = (0, import_node_fs5.readdirSync)((0, import_node_path5.join)(root, rel));
    } catch {
      return;
    }
    for (const name of names) {
      if (name === ".git" || name === "node_modules") continue;
      const path2 = rel === "" ? name : `${rel}/${name}`;
      try {
        if ((0, import_node_fs5.statSync)((0, import_node_path5.join)(root, path2)).isDirectory()) walk(path2);
        else out.push(path2);
      } catch {
      }
    }
  };
  walk(dir);
  return out;
}
function runCheck(options) {
  const { root, base, head } = options;
  if (!REVISION_PATTERN.test(base) || head !== void 0 && !REVISION_PATTERN.test(head)) return { ok: false, reason: "--base and --head take revisions such as origin/main or HEAD." };
  const config = loadConfig(root);
  if (!config.ok) return config;
  const run2 = options.map ?? config.config.map ?? mainMap(root);
  if (run2 === null) return { ok: false, reason: `No map to check against. Generate one with an empty focus, or name one with --map or "map" in ${CONFIG_FILE}.` };
  const runDir = (0, import_node_path5.join)(root, ARCHIFY_DIR, run2);
  let diagram;
  try {
    const read2 = readDiagram(JSON.parse((0, import_node_fs5.readFileSync)((0, import_node_path5.join)(runDir, CANDIDATE_FILE), "utf8")));
    if (!read2.ok) return { ok: false, reason: `${ARCHIFY_DIR}/${run2}/${CANDIDATE_FILE}: ${read2.reason}` };
    diagram = read2.diagram;
  } catch (error) {
    return { ok: false, reason: `Cannot read ${ARCHIFY_DIR}/${run2}/${CANDIDATE_FILE}: ${error.message}` };
  }
  const shared = mergeBase(root, base, head ?? "HEAD");
  if (shared === null) return { ok: false, reason: `No common commit between ${base} and ${head ?? "HEAD"}.` };
  const diff = diffBetween(root, shared, head ?? null);
  if (diff === null) return { ok: false, reason: `git diff ${shared} ${head ?? ""} failed.` };
  const changes = parseDiff(diff).filter((change) => !change.path.startsWith(`${ARCHIFY_DIR}/`));
  if (head === void 0) {
    for (const path2 of untrackedFiles(root).filter((file) => !file.startsWith(`${ARCHIFY_DIR}/`))) {
      const bytes = fileReader(root)(path2);
      changes.push({ path: path2, oldPath: path2, status: "added", hunks: [], added: bytes === null ? 0 : countLines(bytes) });
    }
  }
  const prints = readFingerprints(runDir);
  const read = head === void 0 ? fileReader(root) : (path2) => fileAt(root, head, path2);
  const renames = prints?.revision ? renamesSince(root, prints.revision, process.env, head) : /* @__PURE__ */ new Map();
  const delta = deltaReport({
    components: diagram.components,
    changes,
    freshness: mapFreshness(prints, read, renames),
    ignore: (config.config.ignore ?? []).map(globToRegExp),
    existedAtBase: (dir) => existsAt(root, shared, dir),
    sourceFilesIn: (dir) => (head === void 0 ? filesOnDisk(root, dir) : filesAt(root, head, dir)).filter(isSourceFile).length
  });
  const outcome = verdict(delta, options.failOn ?? config.config.check?.failOn ?? []);
  return { ok: true, diagram, report: { map: run2, base, head: head ?? null, mergeBase: shared, ...delta, ...outcome } };
}

// src/model/deltaMarkdown.ts
var COMMENT_MARKER = "<!-- sustain-check -->";
function escapeMarkdown(text) {
  return text.replace(/([\\`*_{}[\]()#+!~-])/g, "\\$1").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\r?\n/g, " ");
}
function path(text) {
  return text.includes("`") || /[\r\n]/.test(text) ? escapeMarkdown(text) : `\`${text}\``;
}
function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
function deltaSummary(report) {
  const touched = report.touched.strong.length + report.touched.weak.length;
  return [
    `${plural(touched, "box", "boxes")} touched`,
    plural(report.candidates.length, "new box candidate"),
    plural(report.stale.length, "stale box", "stale boxes"),
    plural(report.gone.length, "gone box", "gone boxes"),
    `${plural(report.uncovered.length, "file")} not on the map`
  ].join(" \xB7 ");
}
function candidateLine(candidate) {
  return `- ${path(`${candidate.dir}/`)}: ${plural(candidate.files.length, "file")}, ${plural(candidate.lines, "line")}. Suggested box: ${escapeMarkdown(candidate.label)}`;
}
function deltaMarkdown(report, meta, maxItems = Number.POSITIVE_INFINITY) {
  const lines = [`### Sustain check: ${meta.result}`, "", `**${deltaSummary(report)}**`, "", `Map ${path(meta.map)}, compared from ${path(meta.mergeBase.slice(0, 7))}.`];
  const section = (title, items) => {
    if (items.length === 0) return;
    const more = items.length > maxItems ? [`- and ${items.length - maxItems} more`] : [];
    lines.push("", `**${title}**`, "", ...items.slice(0, maxItems), ...more);
  };
  section("Touched boxes", [
    ...report.touched.strong.map((box) => `- ${escapeMarkdown(box.label)}: cited lines changed`),
    ...report.touched.weak.map((box) => `- ${escapeMarkdown(box.label)}: other lines in its files changed`)
  ]);
  section("New box candidates", report.candidates.map(candidateLine));
  section(
    "Stale boxes",
    report.stale.map((box) => `- ${escapeMarkdown(box.label)}: ${box.state === "missing" ? "a cited file is gone" : "its cited code changed since the map"}`)
  );
  section("Gone boxes", report.gone.map((box) => `- ${escapeMarkdown(box.label)}: every cited file is gone`));
  section(`Not on the map (${plural(report.uncovered.length, "file")})`, report.uncovered.map((file) => `- ${path(file)}`));
  if (meta.reasons.length > 0) lines.push("", `Failed on: ${meta.reasons.map(escapeMarkdown).join("; ")}.`);
  return `${lines.join("\n")}
`;
}
function mermaidLabel(text) {
  return text.replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/[\r\n]+/g, " ");
}
function deltaMermaid(report, diagram) {
  const touched = new Set([...report.touched.strong, ...report.touched.weak].map((box) => box.id));
  if (touched.size === 0 && report.candidates.length === 0) return null;
  const shown = new Set(touched);
  for (const connection of diagram.connections) {
    if (touched.has(connection.from)) shown.add(connection.to);
    if (touched.has(connection.to)) shown.add(connection.from);
  }
  const ids = /* @__PURE__ */ new Map();
  const lines = ["```mermaid", "flowchart LR"];
  for (const component of diagram.components) {
    if (!shown.has(component.id)) continue;
    const node = `n${ids.size}`;
    ids.set(component.id, node);
    const strong = report.touched.strong.some((box) => box.id === component.id);
    lines.push(`  ${node}["${mermaidLabel(component.label)}"]${strong ? ":::strong" : touched.has(component.id) ? ":::weak" : ""}`);
  }
  for (const connection of diagram.connections) {
    const from = ids.get(connection.from);
    const to = ids.get(connection.to);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }
  report.candidates.forEach((candidate, index) => lines.push(`  c${index}["${mermaidLabel(`${candidate.label} (new)`)}"]:::candidate`));
  lines.push("  classDef strong stroke-width:3px", "  classDef weak stroke-dasharray:3 3", "  classDef candidate stroke-dasharray:6 4,fill:none", "```");
  return lines.join("\n");
}

// action/src/main.ts
var COMMENT_ITEMS = 30;
function input(env, name) {
  return (env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}
function pullRequest(event) {
  const pull = event?.pull_request;
  return typeof pull?.number === "number" && typeof pull.base?.ref === "string" ? { number: pull.number, baseRef: pull.base.ref } : null;
}
async function runAction(context) {
  const pull = pullRequest(context.event);
  if (pull === null) {
    context.log("Sustain check runs on pull_request events; this event has no pull request.");
    return { exitCode: 1, result: "error", comment: null };
  }
  const failOn = input(context.env, "fail-on").split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (!failOn.every((entry) => FAIL_ON.includes(entry))) {
    context.log(`fail-on takes ${FAIL_ON.join(", ")}.`);
    return { exitCode: 1, result: "error", comment: null };
  }
  if (input(context.env, "upload") === "true") context.log("upload arrives with Sustain Cloud; nothing was uploaded.");
  const map = input(context.env, "map");
  const outcome = runCheck({ root: context.root, base: `origin/${pull.baseRef}`, head: "HEAD", ...map === "" ? {} : { map }, failOn });
  if (!outcome.ok) {
    context.log(outcome.reason);
    return { exitCode: 1, result: "error", comment: null };
  }
  const { report, diagram } = outcome;
  const chart = deltaMermaid(report, diagram);
  const body = [COMMENT_MARKER, deltaMarkdown(report, report, COMMENT_ITEMS).trimEnd(), ...chart === null ? [] : ["", chart]].join("\n");
  if (input(context.env, "comment") !== "false") {
    const existing = (await context.client.listComments(pull.number)).find((comment) => comment.body.startsWith(COMMENT_MARKER));
    if (existing) await context.client.updateComment(existing.id, body);
    else await context.client.createComment(pull.number, body);
  }
  context.log(`Sustain check: ${report.result}${report.reasons.length > 0 ? ` (${report.reasons.join("; ")})` : ""}`);
  return { exitCode: report.result === "pass" ? 0 : 1, result: report.result, comment: body };
}

// action/src/index.ts
async function main() {
  const env = process.env;
  const event = JSON.parse((0, import_node_fs6.readFileSync)(env["GITHUB_EVENT_PATH"] ?? "", "utf8"));
  const client = restClient(env["GITHUB_API_URL"] ?? "https://api.github.com", env["GITHUB_REPOSITORY"] ?? "", env["INPUT_GITHUB-TOKEN"] ?? "");
  const outcome = await runAction({ env, root: env["GITHUB_WORKSPACE"] ?? process.cwd(), event, client, log: (line) => process.stdout.write(`${line}
`) });
  if (env["GITHUB_OUTPUT"]) (0, import_node_fs6.appendFileSync)(env["GITHUB_OUTPUT"], `result=${outcome.result}
`);
  if (env["GITHUB_STEP_SUMMARY"] && outcome.comment !== null) (0, import_node_fs6.appendFileSync)(env["GITHUB_STEP_SUMMARY"], `${outcome.comment}
`);
  return outcome.exitCode;
}
main().then(
  (code) => process.exitCode = code,
  (error) => {
    process.stdout.write(`::error::${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  }
);
