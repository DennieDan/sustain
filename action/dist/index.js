"use strict";

// action/src/index.ts
var import_node_fs7 = require("node:fs");

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
var import_node_fs6 = require("node:fs");
var import_node_path6 = require("node:path");

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

// src/model/rules.ts
var RULE_KINDS = ["forbid", "only-via", "isolated"];
var PATH_PREFIX = "path:";
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var ends = (value) => typeof value === "string" && value !== "" ? [value] : Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry !== "") ? value : null;
function readRules(value) {
  const rules = [];
  const errors = [];
  if (!Array.isArray(value)) return { rules, errors: ['"rules" must be a list'] };
  const ids = /* @__PURE__ */ new Set();
  value.forEach((entry, index) => {
    const at = `rules[${index}]`;
    if (!isRecord(entry)) return void errors.push(`${at} must be an object`);
    const unknown = Object.keys(entry).filter((key) => !["id", "kind", "from", "to", "via", "reason"].includes(key));
    for (const key of unknown) errors.push(`${at} has unknown key "${key}"`);
    const id = entry["id"];
    const kind = entry["kind"];
    if (typeof id !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(id)) errors.push(`${at}.id must be letters, digits, ".", "_" or "-"`);
    else if (ids.has(id)) errors.push(`${at}.id "${id}" is used twice`);
    if (typeof id === "string") ids.add(id);
    if (!RULE_KINDS.includes(kind)) errors.push(`${at}.kind must be ${RULE_KINDS.join(", ")}`);
    const from = ends(entry["from"]);
    const to = entry["to"] === void 0 ? void 0 : ends(entry["to"]);
    const via = entry["via"] === void 0 ? void 0 : ends(entry["via"]);
    if (from === null) errors.push(`${at}.from must be a box id, a "path:" glob, or a list of them`);
    if (to === null) errors.push(`${at}.to must be a box id, a "path:" glob, or a list of them`);
    if (via === null) errors.push(`${at}.via must be a box id, a "path:" glob, or a list of them`);
    if ((kind === "forbid" || kind === "only-via") && to === void 0) errors.push(`${at} needs "to"`);
    if (kind === "only-via" && via === void 0) errors.push(`${at} needs "via"`);
    if (typeof entry["reason"] !== "string" || entry["reason"].trim() === "") errors.push(`${at}.reason must say why the rule exists`);
    if (unknown.length === 0 && typeof id === "string" && RULE_KINDS.includes(kind) && from && to !== null && via !== null && typeof entry["reason"] === "string" && entry["reason"].trim() !== "") {
      if ((kind === "forbid" || kind === "only-via") && to === void 0) return;
      if (kind === "only-via" && via === void 0) return;
      rules.push({ id, kind, from, ...to ? { to } : {}, ...via ? { via } : {}, reason: entry["reason"] });
    }
  });
  return { rules, errors };
}
function matcher(targets, ownership) {
  const boxes = new Set((targets ?? []).filter((target) => !target.startsWith(PATH_PREFIX)));
  const globs = (targets ?? []).filter((target) => target.startsWith(PATH_PREFIX)).map((target) => globToRegExp(target.slice(PATH_PREFIX.length)));
  return (file) => globs.some((glob) => glob.test(file)) || boxes.size > 0 && ownership.owners(file).some((owner) => boxes.has(owner));
}
function checkRules(rules, components, refs) {
  const ownership = new Ownership(components);
  const violations = [];
  for (const rule of rules) {
    const from = matcher(rule.from, ownership);
    const to = matcher(rule.to, ownership);
    const via = matcher(rule.via, ownership);
    const breaks = (file, imported) => {
      if (rule.kind === "forbid") return from(file) && to(imported);
      if (rule.kind === "only-via") return to(imported) && !to(file) && !via(file);
      return from(imported) && !from(file) && !to(file);
    };
    const found = [];
    for (const [file, imports] of refs) {
      for (const ref of imports) if (ref.path !== file && breaks(file, ref.path)) found.push({ rule: rule.id, kind: rule.kind, reason: rule.reason, file, line: ref.line, imported: ref.path });
    }
    violations.push(...found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line));
  }
  return violations;
}

// src/model/types.ts
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/model/config.ts
var CONFIG_FILE = "sustain.config.json";
var FAIL_ON = ["stale", "new-box", "new-arrow", "violation"];
function strings(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function readConfig(value) {
  if (!isJsonObject(value)) return { ok: false, errors: ["the config must be a JSON object"] };
  const errors = [];
  for (const key of Object.keys(value)) if (!["map", "ignore", "check", "rules"].includes(key)) errors.push(`unknown key "${key}"`);
  if (value["map"] !== void 0 && (typeof value["map"] !== "string" || !/^[a-z0-9]+-[A-Za-z0-9._-]+$/.test(value["map"]))) errors.push('"map" must name a run folder in .archify/');
  if (value["ignore"] !== void 0 && !strings(value["ignore"])) errors.push('"ignore" must be a list of globs');
  if (value["rules"] !== void 0) errors.push(...readRules(value["rules"]).errors);
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
    const inGroup = new Set(members.map((change) => change.path));
    let internal = 0;
    const toBoxes = /* @__PURE__ */ new Map();
    for (const member of members) {
      for (const target of inputs.imports?.head.get(member.path) ?? []) {
        if (inGroup.has(target)) internal++;
        else for (const owner of ownership.owners(target)) toBoxes.set(owner, (toBoxes.get(owner) ?? 0) + 1);
      }
    }
    const cohesive = internal > 0 && internal > Math.max(0, ...toBoxes.values());
    if (dir !== "" && (fresh || grown || cohesive)) {
      candidates.push({
        dir,
        files: members.map((change) => ({ path: change.path, added: change.added ?? 0 })).sort((a, b) => a.path.localeCompare(b.path)),
        lines,
        label: dir.slice(dir.lastIndexOf("/") + 1)
      });
    }
  }
  const connected = (a, b) => (inputs.connections ?? []).some((arrow) => arrow.from === a && arrow.to === b || arrow.from === b && arrow.to === a);
  const arrows = /* @__PURE__ */ new Map();
  for (const [file, targets] of inputs.imports?.head ?? /* @__PURE__ */ new Map()) {
    const before = new Set(inputs.imports?.base.get(file) ?? []);
    for (const target of targets) {
      if (before.has(target)) continue;
      for (const from of ownership.owners(file)) {
        for (const to of ownership.owners(target)) {
          if (from === to || connected(from, to)) continue;
          const key = `${from}\0${to}`;
          const arrow = arrows.get(key) ?? { from: ref(from), to: ref(to), links: [] };
          arrow.links.push({ from: file, to: target });
          arrows.set(key, arrow);
        }
      }
    }
  }
  return {
    touched: { strong: marks.strong.map(ref), weak: marks.weak.map(ref) },
    stale,
    uncovered: uncoveredChanges.map((change) => change.path).sort(),
    candidates: candidates.sort((a, b) => a.dir.localeCompare(b.dir)),
    gone: gone.map(ref),
    arrows: [...arrows.values()].sort((a, b) => a.from.id.localeCompare(b.from.id) || a.to.id.localeCompare(b.to.id)),
    violations: [...inputs.violations ?? []]
  };
}
function verdict(report, failOn) {
  const reasons = [];
  if (failOn.includes("stale") && report.stale.length + report.gone.length > 0) reasons.push(`${report.stale.length + report.gone.length} stale or gone box(es)`);
  if (failOn.includes("new-box") && report.candidates.length > 0) reasons.push(`${report.candidates.length} new box candidate(s)`);
  if (failOn.includes("new-arrow") && report.arrows.length > 0) reasons.push(`${report.arrows.length} new arrow candidate(s)`);
  if (failOn.includes("violation") && report.violations.length > 0) reasons.push(`${report.violations.length} rule violation(s)`);
  return { result: reasons.length === 0 ? "pass" : "fail", reasons };
}

// src/model/discovery.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/model/runFolder.ts
var ARCHIFY_DIR = ".archify";
var CANDIDATE_FILE = "candidate.sir";
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

// src/model/evidence/paths.ts
function joinPath(dir, rel) {
  const parts = dir === "" ? [] : dir.split("/");
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
function lineAt(text, index) {
  let line = 1;
  for (let at = text.indexOf("\n"); at !== -1 && at < index; at = text.indexOf("\n", at + 1)) line++;
  return line;
}
var ImportSet = class {
  lines = /* @__PURE__ */ new Map();
  add(path2, line) {
    const seen = this.lines.get(path2);
    if (seen === void 0 || line < seen) this.lines.set(path2, line);
  }
  delete(path2) {
    this.lines.delete(path2);
  }
  /** Sorted by path. */
  refs() {
    return [...this.lines].sort(([a], [b]) => a.localeCompare(b)).map(([path2, line]) => ({ path: path2, line }));
  }
};

// src/model/evidence/java.ts
var PACKAGE = /^\s*package\s+([\w.]+)\s*;/m;
var IMPORT = /^\s*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/gm;
var baseName = (path2) => path2.slice(path2.lastIndexOf("/") + 1).replace(/\.java$/, "");
function javaIndex(files, read) {
  const index = { classes: /* @__PURE__ */ new Map(), packages: /* @__PURE__ */ new Map(), packageOf: /* @__PURE__ */ new Map() };
  for (const file of files) {
    const text = read(file);
    if (text === null) continue;
    const pkg = PACKAGE.exec(text)?.[1] ?? "";
    index.classes.set(pkg === "" ? baseName(file) : `${pkg}.${baseName(file)}`, file);
    index.packages.set(pkg, [...index.packages.get(pkg) ?? [], file]);
    index.packageOf.set(file, pkg);
  }
  return index;
}
function javaImports(file, text, index) {
  const found = new ImportSet();
  for (const match of text.matchAll(IMPORT)) {
    const [, , name, star] = match;
    const line = lineAt(text, match.index);
    if (star) {
      const classFile = index.classes.get(name);
      if (classFile !== void 0) found.add(classFile, line);
      else for (const member of index.packages.get(name) ?? []) found.add(member, line);
      continue;
    }
    for (let target = name; target !== ""; target = target.includes(".") ? target.slice(0, target.lastIndexOf(".")) : "") {
      const classFile = index.classes.get(target);
      if (classFile !== void 0) {
        found.add(classFile, line);
        break;
      }
    }
  }
  const pkg = index.packageOf.get(file) ?? "";
  for (const other of index.packages.get(pkg) ?? []) {
    if (other === file) continue;
    for (const use of text.matchAll(new RegExp(`\\b${baseName(other)}\\b`, "g"))) {
      const line = lineAt(text, use.index);
      if (/^\s*(package|import)\b/.test(text.split("\n")[line - 1] ?? "")) continue;
      found.add(other, line);
      break;
    }
  }
  found.delete(file);
  return found.refs();
}

// src/model/evidence/python.ts
var IMPORT2 = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)/gm;
var FROM = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]+)/gm;
function dotted(path2, root) {
  if (root !== "" && !path2.startsWith(`${root}/`)) return null;
  const rel = (root === "" ? path2 : path2.slice(root.length + 1)).replace(/\.py$/, "").replace(/\/__init__$/, "");
  return rel === "__init__" ? null : rel.split("/").join(".");
}
function pythonIndex(files) {
  const set = new Set(files);
  const modules = /* @__PURE__ */ new Map();
  for (const file of files) {
    let packageDir = null;
    for (let dir = dirOf(file); dir !== "" && set.has(`${dir}/__init__.py`); dir = dirOf(dir)) packageDir = dir;
    const roots = /* @__PURE__ */ new Set(["", "src", packageDir === null ? dirOf(file) : dirOf(packageDir)]);
    for (const root of roots) {
      const name = dotted(file, root);
      if (name !== null && name !== "") modules.set(name, [.../* @__PURE__ */ new Set([...modules.get(name) ?? [], file])]);
    }
  }
  return { files: set, modules };
}
function moduleAt(path2, files) {
  if (path2 === null) return null;
  return [`${path2}.py`, `${path2}/__init__.py`].find((candidate) => files.has(candidate)) ?? null;
}
function absolute(name, index) {
  for (let target = name; target !== ""; target = target.includes(".") ? target.slice(0, target.lastIndexOf(".")) : "") {
    const files = index.modules.get(target);
    if (files !== void 0) return files;
  }
  return [];
}
function pythonImports(file, text, index) {
  const found = new ImportSet();
  for (const match of text.matchAll(IMPORT2)) {
    const line = lineAt(text, match.index);
    for (const part of match[1].split(",")) for (const target of absolute(part.trim().split(/[ \t]+/)[0], index)) found.add(target, line);
  }
  for (const match of text.matchAll(FROM)) {
    const [, dots, module2, list] = match;
    const line = lineAt(text, match.index);
    const names = list.replace(/[()]/g, "").split(",").map((name) => name.trim().split(/\s+/)[0]).filter((name) => /^\w+$/.test(name));
    if (dots === "") {
      for (const name of names) {
        const sub = index.modules.get(`${module2}.${name}`);
        if (sub !== void 0) for (const target of sub) found.add(target, line);
        else for (const target of absolute(module2, index)) found.add(target, line);
      }
      continue;
    }
    let base = dirOf(file);
    for (let i = 1; i < dots.length && base !== null; i++) base = base === "" ? null : dirOf(base);
    const modulePath = base === null ? null : module2 === "" ? base : joinPath(base, module2.split(".").join("/"));
    for (const name of names) {
      const target = moduleAt(modulePath === null ? null : joinPath(modulePath, name), index.files) ?? moduleAt(modulePath, index.files);
      if (target !== null) found.add(target, line);
    }
  }
  found.delete(file);
  return found.refs();
}

// src/model/evidence/typescript.ts
var SPECIFIERS = [
  /\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
];
var EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
var SOURCE_FOR = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };
var CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];
function parseLoose(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
function pathConfig(path2, text) {
  let options;
  try {
    options = parseLoose(text).compilerOptions;
  } catch {
    return null;
  }
  if (options === void 0) return null;
  const dir = dirOf(path2);
  const baseUrl = typeof options.baseUrl === "string" ? joinPath(dir, options.baseUrl) : null;
  const paths = options.paths !== null && typeof options.paths === "object" ? Object.entries(options.paths).flatMap(([pattern, targets]) => Array.isArray(targets) ? [[pattern, targets.filter((target) => typeof target === "string")]] : []) : [];
  if (baseUrl === null && paths.length === 0) return null;
  return { base: baseUrl ?? dir, baseUrl, paths };
}
function resolveFile(base, files) {
  if (base === null) return null;
  const dot = base.lastIndexOf(".");
  const extension = dot > base.lastIndexOf("/") ? base.slice(dot) : "";
  const candidates = [base, ...(SOURCE_FOR[extension] ?? []).map((source) => base.slice(0, dot) + source), ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => `${base}/index${ext}`)];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}
function throughConfig(specifier, config, files) {
  for (const [pattern, targets] of config.paths) {
    const star = pattern.indexOf("*");
    const matched = star < 0 ? specifier === pattern ? "" : null : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1)) ? specifier.slice(star, specifier.length - (pattern.length - star - 1)) : null;
    if (matched === null) continue;
    for (const target of targets) {
      const found = resolveFile(joinPath(config.base, target.replace("*", matched)), files);
      if (found !== null) return found;
    }
  }
  return config.baseUrl === null ? null : resolveFile(joinPath(config.baseUrl, specifier), files);
}
function typescriptImports(file, text, files, configFor) {
  const found = new ImportSet();
  for (const pattern of SPECIFIERS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      const resolved = specifier.startsWith(".") ? resolveFile(joinPath(dirOf(file), specifier), files) : (() => {
        const config = configFor(dirOf(file));
        return config === null ? null : throughConfig(specifier, config, files);
      })();
      if (resolved !== null && resolved !== file) found.add(resolved, lineAt(text, match.index));
    }
  }
  return found.refs();
}

// src/model/evidence/graph.ts
function importLanguage(path2) {
  if (path2.endsWith(".java")) return "java";
  if (/\.py$/.test(path2)) return "python";
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path2) && !path2.endsWith(".d.ts")) return "typescript";
  return null;
}
function importResolver(files, read) {
  const byLanguage = (language) => files.filter((file) => importLanguage(file) === language);
  const all = new Set(files);
  const java = javaIndex(byLanguage("java"), read);
  const python = pythonIndex(byLanguage("python"));
  const configs = /* @__PURE__ */ new Map();
  const configFor = (dir) => {
    if (configs.has(dir)) return configs.get(dir);
    let found = null;
    for (const name of CONFIG_NAMES) {
      const path2 = joinPath(dir, name);
      const text = all.has(path2) ? read(path2) : null;
      if (text !== null) {
        found = pathConfig(path2, text);
        break;
      }
    }
    if (found === null && dir !== "") found = configFor(dirOf(dir));
    configs.set(dir, found);
    return found;
  };
  return (file, text) => {
    const language = importLanguage(file);
    if (language === "java") return javaImports(file, text, java);
    if (language === "python") return pythonImports(file, text, python);
    return language === "typescript" ? typescriptImports(file, text, all, configFor) : [];
  };
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
  const absolute2 = platform === "win32" ? import_node_path2.win32.isAbsolute : import_node_path2.posix.isAbsolute;
  for (const dir of pathValue.split(platform === "win32" ? ";" : import_node_path2.delimiter)) {
    if (!absolute2(dir)) continue;
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
  const result = (0, import_node_child_process.spawnSync)(program, [...GIT_PREFIX, "check-attr", "-z", "--stdin", "linguist-generated", "linguist-vendored"], {
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

// src/model/repoSize.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");

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
function isDenied(path2) {
  return path2.split("/").some(segmentDenied);
}

// src/model/repoSize.ts
var SKIPPED_DIRS = [".git", "node_modules", "vendor", "dist", "build", "target", "out", ".sustain"];
var MAX_FILE_BYTES = 1024 * 1024;
var BINARY = new Set(
  "png jpg jpeg gif bmp ico webp tif tiff psd pdf zip gz tgz bz2 xz 7z rar jar war ear class o a so dylib dll exe bin wasm woff woff2 ttf otf eot mp3 mp4 m4a mov avi mkv webm wav flac ogg sqlite db pyc pyo vsix lockb".split(" ")
);
var TEST_DIRS = /* @__PURE__ */ new Set(["test", "tests", "__tests__", "spec", "specs", "e2e", "testdata", "fixtures"]);
var TEST_FILES = /(\.|_)(test|spec)\.[^./]+$|^test_[^/]+\.py$|(Test|Tests|IT)\.(java|kt|scala)$|_spec\.rb$/;
function isTestPath(path2) {
  const segments = path2.split("/");
  const name = segments.pop();
  return segments.some((segment) => TEST_DIRS.has(segment.toLowerCase())) || TEST_FILES.test(name);
}
function skipped(path2) {
  return path2.split("/").some((segment) => SKIPPED_DIRS.includes(segment)) || isDenied(path2);
}
function walk(root) {
  const files = [];
  const pending = [""];
  while (pending.length > 0) {
    const dir = pending.pop();
    let entries;
    try {
      entries = (0, import_node_fs3.readdirSync)((0, import_node_path3.join)(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path2 = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (SKIPPED_DIRS.includes(entry.name) || isDenied(path2)) continue;
      if (entry.isDirectory()) pending.push(path2);
      else if (entry.isFile()) files.push(path2);
    }
  }
  return files.sort();
}
function listFiles(root, env = process.env) {
  const tracked = trackedFiles(root, env);
  const kept = tracked === null ? walk(root) : tracked.filter((path2) => !skipped(path2)).sort();
  const generated = tracked === null ? /* @__PURE__ */ new Set() : generatedFiles(root, kept, env);
  return { listing: tracked === null ? "walk" : "git", files: generated.size === 0 ? kept : kept.filter((path2) => !generated.has(path2)) };
}

// src/model/runRecord.ts
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");

// src/model/session.ts
var STALE_IDLE_MS = 24 * 60 * 60 * 1e3;

// src/model/runRecord.ts
var RUN_FILE = "run.json";
function readRunRecord(runDir) {
  try {
    const value = JSON.parse((0, import_node_fs4.readFileSync)((0, import_node_path4.join)(runDir, RUN_FILE), "utf8"));
    return isJsonObject(value) && value["schema"] === 1 && typeof value["phase"] === "string" ? value : null;
  } catch {
    return null;
  }
}

// src/model/staleness.ts
var import_node_fs5 = require("node:fs");
var import_node_path5 = require("node:path");

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
    const value = JSON.parse((0, import_node_fs5.readFileSync)((0, import_node_path5.join)(runDir, FINGERPRINTS_FILE), "utf8"));
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
      return (0, import_node_fs5.readFileSync)((0, import_node_path5.join)(root, ...path2.split("/")));
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
function readSources(value, pointer, skipped2) {
  if (!Array.isArray(value)) return [];
  const sources = [];
  value.forEach((entry, k) => {
    const path2 = isObj(entry) ? str(entry["path"]) : void 0;
    if (!isObj(entry) || path2 === void 0) {
      skipped2.push(`${pointer}/sources/${k}: no string path`);
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
  const skipped2 = [];
  const components = [];
  const ids = /* @__PURE__ */ new Set();
  rawComponents.forEach((raw, i) => {
    const pointer = `/components/${i}`;
    const id = isObj(raw) ? str(raw["id"]) : void 0;
    if (!isObj(raw) || id === void 0) {
      skipped2.push(`${pointer}: no string id`);
      return;
    }
    if (ids.has(id)) {
      skipped2.push(`${pointer}: duplicate id ${id}`);
      return;
    }
    ids.add(id);
    const type = str(raw["type"]);
    const component = {
      id,
      label: str(raw["label"]) || id,
      type: COMPONENT_TYPES.includes(type) ? type : "external",
      sources: readSources(raw["sources"], pointer, skipped2)
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
        skipped2.push(`/connections/${i}: from/to do not resolve`);
        return;
      }
      const variant = str(raw["variant"]);
      const connection = { from, to, variant: VARIANTS.includes(variant) ? variant : "default" };
      const label = str(raw["label"]);
      const id = str(raw["id"]);
      if (id !== void 0) connection.id = id;
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
        skipped2.push(`${pointer}: not an object`);
        return;
      }
      const wraps = [];
      const rawWraps = Array.isArray(raw["wraps"]) ? raw["wraps"] : [];
      rawWraps.forEach((member, j) => {
        if (typeof member === "string" && ids.has(member)) {
          if (!wraps.includes(member)) wraps.push(member);
        } else skipped2.push(`${pointer}/wraps/${j}: does not resolve`);
      });
      if (wraps.length === 0) {
        skipped2.push(`${pointer}: no members left`);
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
  return { ok: true, diagram, skipped: skipped2 };
}

// src/model/check.ts
function loadConfig(root) {
  let text;
  try {
    text = (0, import_node_fs6.readFileSync)((0, import_node_path6.join)(root, CONFIG_FILE), "utf8");
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
    if ((readRunRecord((0, import_node_path6.dirname)(candidate.file))?.focus ?? "") === "") return candidate.runFolder;
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
  const walk2 = (rel) => {
    let names;
    try {
      names = (0, import_node_fs6.readdirSync)((0, import_node_path6.join)(root, rel));
    } catch {
      return;
    }
    for (const name of names) {
      if (name === ".git" || name === "node_modules") continue;
      const path2 = rel === "" ? name : `${rel}/${name}`;
      try {
        if ((0, import_node_fs6.statSync)((0, import_node_path6.join)(root, path2)).isDirectory()) walk2(path2);
        else out.push(path2);
      } catch {
      }
    }
  };
  walk2(dir);
  return out;
}
function runCheck(options) {
  const { root, base, head } = options;
  if (!REVISION_PATTERN.test(base) || head !== void 0 && !REVISION_PATTERN.test(head)) return { ok: false, reason: "--base and --head take revisions such as origin/main or HEAD." };
  const config = loadConfig(root);
  if (!config.ok) return config;
  const run2 = options.map ?? config.config.map ?? mainMap(root);
  if (run2 === null) return { ok: false, reason: `No map to check against. Generate one with an empty focus, or name one with --map or "map" in ${CONFIG_FILE}.` };
  const runDir = (0, import_node_path6.join)(root, ARCHIFY_DIR, run2);
  let diagram;
  try {
    const read2 = readDiagram(JSON.parse((0, import_node_fs6.readFileSync)((0, import_node_path6.join)(runDir, CANDIDATE_FILE), "utf8")));
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
  const text = (path2) => read(path2)?.toString("utf8") ?? null;
  const headFiles = head === void 0 ? [.../* @__PURE__ */ new Set([...listFiles(root).files, ...changes.map((change) => change.path)])] : filesAt(root, head, "");
  const resolve = importResolver(headFiles, text);
  const imports = { base: /* @__PURE__ */ new Map(), head: /* @__PURE__ */ new Map() };
  const headRefs = /* @__PURE__ */ new Map();
  for (const change of changes) {
    if (change.status === "deleted" || importLanguage(change.path) === null) continue;
    const now = text(change.path);
    if (now !== null) {
      const refs = resolve(change.path, now);
      imports.head.set(change.path, refs.map((ref) => ref.path));
      if (!isTestPath(change.path)) headRefs.set(change.path, refs);
    }
    const before = change.status === "added" ? null : fileAt(root, shared, change.oldPath)?.toString("utf8") ?? null;
    if (before !== null) imports.base.set(change.path, resolve(change.oldPath, before).map((ref) => ref.path));
  }
  const violations = checkRules(readRules(config.config.rules ?? []).rules, diagram.components, headRefs).filter((violation) => !(imports.base.get(violation.file) ?? []).includes(violation.imported));
  const renames = prints?.revision ? renamesSince(root, prints.revision, process.env, head) : /* @__PURE__ */ new Map();
  const delta = deltaReport({
    components: diagram.components,
    changes,
    freshness: mapFreshness(prints, read, renames),
    ignore: (config.config.ignore ?? []).map(globToRegExp),
    existedAtBase: (dir) => existsAt(root, shared, dir),
    sourceFilesIn: (dir) => (head === void 0 ? filesOnDisk(root, dir) : filesAt(root, head, dir)).filter(isSourceFile).length,
    connections: diagram.connections,
    imports,
    violations
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
    `${plural(report.uncovered.length, "file")} not on the map`,
    // PRC-06: named only when there are some, so reports without them read as before.
    ...report.arrows.length > 0 ? [plural(report.arrows.length, "new arrow candidate")] : [],
    ...report.violations.length > 0 ? [plural(report.violations.length, "rule violation")] : []
  ].join(" \xB7 ");
}
function violationLine(violation) {
  return `- ${escapeMarkdown(violation.rule)}: ${path(violation.file)} line ${violation.line} imports ${path(violation.imported)}. ${escapeMarkdown(violation.reason)}`;
}
function arrowLine(arrow) {
  const [first] = arrow.links;
  const more = arrow.links.length > 1 ? `, and ${plural(arrow.links.length - 1, "more import")}` : "";
  return `- ${escapeMarkdown(arrow.from.label)} to ${escapeMarkdown(arrow.to.label)}: ${path(first.from)} now imports ${path(first.to)}${more}. The map has no arrow between them.`;
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
  section("New arrow candidates", report.arrows.map(arrowLine));
  section("Rule violations", report.violations.map(violationLine));
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
  if (touched.size === 0 && report.candidates.length === 0 && report.arrows.length === 0) return null;
  const shown = /* @__PURE__ */ new Set([...touched, ...report.arrows.flatMap((arrow) => [arrow.from.id, arrow.to.id])]);
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
  for (const arrow of report.arrows) {
    const from = ids.get(arrow.from.id);
    const to = ids.get(arrow.to.id);
    if (from && to) lines.push(`  ${from} -.->|new import| ${to}`);
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
  const typed = event;
  const pull = typed?.pull_request;
  if (typeof pull?.number !== "number" || typeof pull.base?.ref !== "string") return null;
  const defaultBranch = typed?.repository?.default_branch;
  return { number: pull.number, baseRef: pull.base.ref, headRef: typeof pull.head?.ref === "string" ? pull.head.ref : pull.base.ref, defaultBranch: typeof defaultBranch === "string" ? defaultBranch : void 0 };
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
  const event = JSON.parse((0, import_node_fs7.readFileSync)(env["GITHUB_EVENT_PATH"] ?? "", "utf8"));
  const client = restClient(env["GITHUB_API_URL"] ?? "https://api.github.com", env["GITHUB_REPOSITORY"] ?? "", env["INPUT_GITHUB-TOKEN"] ?? "");
  const outcome = await runAction({ env, root: env["GITHUB_WORKSPACE"] ?? process.cwd(), event, client, log: (line) => process.stdout.write(`${line}
`) });
  if (env["GITHUB_OUTPUT"]) (0, import_node_fs7.appendFileSync)(env["GITHUB_OUTPUT"], `result=${outcome.result}
`);
  if (env["GITHUB_STEP_SUMMARY"] && outcome.comment !== null) (0, import_node_fs7.appendFileSync)(env["GITHUB_STEP_SUMMARY"], `${outcome.comment}
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
