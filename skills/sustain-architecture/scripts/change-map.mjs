// src/agent/change-map.ts
import { existsSync, readFileSync as readFileSync2, realpathSync as realpathSync4, statSync as statSync4, writeFileSync as writeFileSync2 } from "node:fs";
import { basename as basename2, dirname as dirname2, join as join5, resolve } from "node:path";

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

// src/model/gitFormat.ts
var COMMIT = /^[0-9a-f]{40}$/;
var NAME = /^(?!-)[A-Za-z0-9._/~^@{}-]+$/;
function isRevision(value, kind) {
  return typeof value === "string" && (kind === "commit" ? COMMIT : NAME).test(value);
}
var C_ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
function unquotePath(path) {
  if (!(path.length >= 2 && path.startsWith('"') && path.endsWith('"'))) return path;
  const bytes = [];
  const body = path.slice(1, -1);
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== "\\") {
      bytes.push(...new TextEncoder().encode(ch));
      continue;
    }
    const next = body[i + 1] ?? "";
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else {
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
function parseNameStatusZ(output) {
  const fields = output.split("\0");
  const entries = [];
  for (let i = 0; i < fields.length; i += 1) {
    const status = fields[i];
    if (status === "") continue;
    if (/^[RC]/.test(status)) {
      const oldPath = fields[i + 1];
      const path = fields[i + 2];
      i += 2;
      if (oldPath && path) entries.push({ status, path, oldPath });
    } else {
      const path = fields[i + 1];
      i += 1;
      if (path) entries.push({ status, path });
    }
  }
  return entries;
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
var HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
function withoutPrefix(path, prefix) {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
function gitHeaderPaths(rest) {
  const half = (rest.length - 1) / 2;
  if (Number.isInteger(half) && rest.startsWith("a/") && rest.slice(half, half + 3) === " b/" && rest.slice(2, half) === rest.slice(half + 3)) {
    return [rest.slice(2, half), rest.slice(half + 3)];
  }
  let oldRaw;
  let newRaw;
  if (rest.startsWith('"')) {
    oldRaw = /^"(?:[^"\\]|\\.)*"/.exec(rest)?.[0] ?? rest;
    newRaw = rest.slice(oldRaw.length + 1);
  } else {
    const split = Math.max(rest.lastIndexOf(" b/"), rest.lastIndexOf(' "b/'));
    oldRaw = split < 0 ? rest : rest.slice(0, split);
    newRaw = split < 0 ? rest : rest.slice(split + 1);
  }
  return [withoutPrefix(unquotePath(oldRaw), "a/"), withoutPrefix(unquotePath(newRaw), "b/")];
}
function headerLinePath(raw, prefix) {
  const path = unquotePath(raw.replace(/\t$/, ""));
  return path === "/dev/null" ? null : withoutPrefix(path, prefix);
}
function parseDiffSections(diff) {
  const sections = [];
  for (const text of diff.split(/^(?=diff --git )/m)) {
    if (!text.startsWith("diff --git ")) continue;
    const lines = text.split("\n");
    const section = {
      text,
      headerPaths: gitHeaderPaths(lines[0].slice("diff --git ".length)),
      oldPath: void 0,
      newPath: void 0,
      renamed: false,
      added: false,
      deleted: false,
      hunks: []
    };
    for (const line of lines.slice(1)) {
      const hunk = HUNK_HEADER.exec(line);
      if (hunk) {
        section.hunks.push({
          header: line,
          oldStart: Number(hunk[1]),
          oldLines: hunk[2] === void 0 ? 1 : Number(hunk[2]),
          newStart: Number(hunk[3]),
          newLines: hunk[4] === void 0 ? 1 : Number(hunk[4])
        });
      } else if (section.hunks.length > 0) {
        continue;
      } else if (line.startsWith("rename from ")) {
        section.oldPath = headerLinePath(line.slice("rename from ".length), "");
        section.renamed = true;
      } else if (line.startsWith("rename to ")) {
        section.newPath = headerLinePath(line.slice("rename to ".length), "");
      } else if (line.startsWith("copy from ")) {
        section.oldPath = headerLinePath(line.slice("copy from ".length), "");
      } else if (line.startsWith("copy to ")) {
        section.newPath = headerLinePath(line.slice("copy to ".length), "");
      } else if (line.startsWith("new file mode")) {
        section.added = true;
      } else if (line.startsWith("deleted file mode")) {
        section.deleted = true;
      } else if (line.startsWith("--- ") && section.oldPath === void 0) {
        section.oldPath = headerLinePath(line.slice(4), "a/");
      } else if (line.startsWith("+++ ") && section.newPath === void 0) {
        section.newPath = headerLinePath(line.slice(4), "b/");
      }
    }
    sections.push(section);
  }
  return sections;
}

// src/model/types.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringifyDocument(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}

// src/model/changeMap.ts
var MAX_UPDATES = 5;
var MAX_CHANGE_BYTES = 2 * 1024 * 1024;
var MAX_BASELINE_DIRTY = 200;
var OWN_OUTPUT_DIR = ".archify";
function decideMode(facts) {
  const base = facts.previousLineage?.revision ?? facts.candidateRevision ?? null;
  const regenerate = (reason) => ({ mode: "regenerate", reason, base });
  if (facts.requested) return regenerate("requested");
  if (!facts.hasPrevious) return regenerate("no-previous");
  if (!facts.hasGit) return regenerate("no-git");
  if (base === null) return regenerate("no-base-revision");
  if (facts.previousLineage !== null && facts.previousLineage.dirtyCount > MAX_BASELINE_DIRTY) return regenerate("dirty-baseline");
  if (!facts.baseReachable(base)) return regenerate("base-unreachable");
  if (facts.previousLineage !== null && facts.previousLineage.updatesSinceRegeneration >= MAX_UPDATES) return regenerate("scheduled");
  return { mode: "update", reason: "update", base };
}
function diagramComponents(value) {
  if (!isRecord(value) || !Array.isArray(value["components"])) return [];
  const out = [];
  for (const component of value["components"]) {
    if (!isRecord(component) || typeof component["id"] !== "string") continue;
    const id = component["id"];
    const label = typeof component["label"] === "string" ? component["label"] : id;
    const sources = Array.isArray(component["sources"]) ? component["sources"] : [];
    const paths = new Set(sources.flatMap((source) => isRecord(source) && typeof source["path"] === "string" ? [source["path"]] : []));
    out.push({ id, label, paths });
  }
  return out;
}
function candidateRevision(value) {
  if (!isRecord(value) || !isRecord(value["meta"]) || !isRecord(value["meta"]["repository"])) return null;
  const revision = value["meta"]["repository"]["revision"];
  return typeof revision === "string" ? revision : null;
}
function splitDiff(raw) {
  return parseDiffSections(raw).map((section) => {
    let { oldPath, newPath } = section;
    if (oldPath === void 0 || newPath === void 0) {
      const [left, right] = section.headerPaths;
      const path = left === right ? left : null;
      if (oldPath === void 0) oldPath = section.added ? null : path;
      if (newPath === void 0) newPath = section.deleted ? null : path;
    }
    return { oldPath, newPath, text: section.text, hunks: section.hunks };
  });
}
function touchedFiles(entries) {
  const out = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    out.add(entry.path);
    if (entry.oldPath) out.add(entry.oldPath);
  }
  return out;
}
function isOwnOutput(path) {
  return path === OWN_OUTPUT_DIR || (path?.startsWith(`${OWN_OUTPUT_DIR}/`) ?? false);
}
function nameOnlyDiff(oldPath, newPath, note) {
  const a = oldPath ?? newPath ?? "";
  const b = newPath ?? oldPath ?? "";
  const lines = [`diff --git a/${a} b/${b}`];
  if (oldPath === null) lines.push("new file");
  else if (newPath === null) lines.push("deleted file");
  else if (oldPath !== newPath) lines.push(`rename from ${oldPath}`, `rename to ${newPath}`);
  lines.push(`(${note})`);
  return { oldPath, newPath, text: `${lines.join("\n")}
`, hunks: [], note };
}
function addedFileDiff(path, content) {
  const lines = content.split("\n");
  const trailingNewline = content.endsWith("\n");
  if (trailingNewline) lines.pop();
  const count = content === "" ? 0 : lines.length;
  const head = [`diff --git a/${path} b/${path}`, "new file (untracked)", "--- /dev/null", `+++ b/${path}`];
  if (count === 0) return { oldPath: null, newPath: path, text: `${head.join("\n")}
`, hunks: [] };
  const header = `@@ -0,0 +1${count === 1 ? "" : `,${count}`} @@`;
  const body = lines.map((line) => `+${line}`);
  if (!trailingNewline) body.push("\\ No newline at end of file");
  return {
    oldPath: null,
    newPath: path,
    text: `${[...head, header, ...body].join("\n")}
`,
    hunks: [{ header, oldStart: 0, oldLines: 0, newStart: 1, newLines: count }]
  };
}
var NOTE_DENIED = "path on the citation deny-list; content not shown";
var NOTE_BINARY = "binary file; content not shown";
var NOTE_UNREADABLE = "untracked; content not shown";
var NOTE_PREVIOUSLY_DIRTY = "uncommitted when the previous diagram was drawn; compare with the current file";
function collectChanges(input) {
  const entries = parseNameStatusZ(input.nameStatus).filter((entry) => !isOwnOutput(entry.path) && !isOwnOutput(entry.oldPath));
  const fileDiffs = splitDiff(input.diff).filter((diff) => !isOwnOutput(diff.oldPath) && !isOwnOutput(diff.newPath));
  const known = touchedFiles(entries);
  for (const path of input.untracked.split("\0")) {
    if (path === "" || isOwnOutput(path) || known.has(path)) continue;
    known.add(path);
    entries.push({ status: "A", path });
    if (!input.cited.has(path)) continue;
    const content = isDenied(path) ? null : input.readUntracked(path);
    fileDiffs.push(content === null ? nameOnlyDiff(null, path, NOTE_UNREADABLE) : addedFileDiff(path, content));
  }
  for (const dirty of input.previousDirty) {
    if (isOwnOutput(dirty)) continue;
    const paths = dirty.endsWith("/") ? [...input.cited].filter((path) => path.startsWith(dirty)).sort() : [dirty];
    for (const path of paths) {
      if (known.has(path)) continue;
      known.add(path);
      const exists = input.exists(path);
      entries.push({ status: exists ? "M" : "D", path });
      if (input.cited.has(path)) fileDiffs.push(nameOnlyDiff(path, exists ? path : null, NOTE_PREVIOUSLY_DIRTY));
    }
  }
  const shown = fileDiffs.map((diff) => {
    if (diff.note !== void 0) return diff;
    if (diff.oldPath !== null && isDenied(diff.oldPath) || diff.newPath !== null && isDenied(diff.newPath)) {
      return nameOnlyDiff(diff.oldPath, diff.newPath, NOTE_DENIED);
    }
    if (/^(Binary files .* differ|GIT binary patch)$/m.test(diff.text)) return nameOnlyDiff(diff.oldPath, diff.newPath, NOTE_BINARY);
    return diff;
  });
  return { fileDiffs: shown, entries };
}
function mapChanges(components, changes) {
  const cited = new Set(components.flatMap((component) => [...component.paths]));
  const touchedComponents = [];
  const untouched = [];
  for (const component of components) {
    const diffs = changes.fileDiffs.filter(
      (diff) => diff.oldPath !== null && component.paths.has(diff.oldPath) || diff.newPath !== null && component.paths.has(diff.newPath)
    );
    if (diffs.length === 0) untouched.push({ id: component.id, label: component.label });
    else touchedComponents.push({ id: component.id, label: component.label, diffs });
  }
  const uncited = changes.entries.filter((entry) => !cited.has(entry.path) && !(entry.oldPath && cited.has(entry.oldPath)));
  return { touchedComponents, untouched, uncited };
}
var short = (sha) => sha.slice(0, 7);
function fence(text, lang = "") {
  const body = text.endsWith("\n") || text === "" ? text : `${text}
`;
  let ticks = "```";
  while (body.includes(ticks)) ticks += "`";
  return `${ticks}${lang}
${body}${ticks}
`;
}
var diffName = (diff) => diff.oldPath && diff.newPath && diff.oldPath !== diff.newPath ? `${diff.oldPath} \u2192 ${diff.newPath}` : diff.newPath ?? `${diff.oldPath} (deleted)`;
var entryName = (entry) => entry.oldPath ? `${entry.status}	${entry.oldPath}	${entry.path}` : `${entry.status}	${entry.path}`;
function renderChange(base, head, map) {
  const out = [`# Code change from ${short(base)} to the working tree at ${short(head)}, grouped by diagram component`, ""];
  out.push("## Changed code by component", "");
  if (map.touchedComponents.length === 0) out.push("No component's cited files changed.", "");
  for (const component of map.touchedComponents) {
    out.push(`### \`${component.id}\` (${component.label})`, "");
    out.push(fence(component.diffs.map((diff) => diff.text).join(""), "diff"));
  }
  out.push("## Changed files that no component cites", "");
  out.push(map.uncited.length === 0 ? "None.\n" : fence(map.uncited.map(entryName).join("\n")));
  return out.join("\n");
}
function renderMapping(base, head, map) {
  const out = [`# Changed files mapped to the components of the previous diagram (${short(base)} \u2192 working tree at ${short(head)})`, ""];
  out.push("## Components whose cited files changed", "");
  if (map.touchedComponents.length === 0) out.push("None.", "");
  for (const component of map.touchedComponents) {
    out.push(`- \`${component.id}\` (${component.label})`);
    for (const diff of component.diffs) {
      const hunks = diff.hunks.map((hunk) => hunk.header.replace(/^(@@[^@]*@@).*$/, "$1")).join(", ");
      const detail = hunks ? `: ${hunks}` : diff.note ? ` (${diff.note})` : "";
      out.push(`  - ${diffName(diff)}${detail}`);
    }
  }
  out.push("", "## Components whose cited files did not change", "");
  out.push(map.untouched.length === 0 ? "None." : map.untouched.map((component) => `- \`${component.id}\` (${component.label})`).join("\n"));
  out.push("", "## Changed files that no component cites", "");
  out.push(map.uncited.length === 0 ? "None." : fence(map.uncited.map(entryName).join("\n")));
  return `${out.join("\n")}
`;
}

// src/model/citationPath.ts
var MAX_PATH_LENGTH = 240;
function citationPathOk(path) {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

// src/model/citations.ts
import { closeSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
var MAX_CITED_BYTES = 2 * 1024 * 1024;
var BINARY_SNIFF_BYTES = 8 * 1024;
function countLines(bytes) {
  let newlines = 0;
  for (const byte of bytes) if (byte === 10) newlines += 1;
  if (bytes.length === 0) return 0;
  return bytes[bytes.length - 1] === 10 ? newlines : newlines + 1;
}
function probeFile(rootReal, path) {
  let real;
  try {
    real = realpathSync(join(rootReal, ...path.split("/")));
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "missing" };
    return { kind: "unreadable", reason: error.message };
  }
  if (real !== rootReal && !real.startsWith(rootReal.endsWith(sep) ? rootReal : rootReal + sep)) {
    return { kind: "outside" };
  }
  let fd;
  try {
    const stat = statSync(real);
    if (!stat.isFile()) return { kind: "notFile" };
    if (stat.size > MAX_CITED_BYTES) return { kind: "tooLarge", size: stat.size };
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_CITED_BYTES) + 1);
    fd = openSync(real, "r");
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_CITED_BYTES) return { kind: "tooLarge", size: length };
    const bytes = buffer.subarray(0, length);
    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { kind: "binary" };
    return { kind: "text", lineCount: countLines(bytes) };
  } catch (error) {
    return { kind: "unreadable", reason: error.message };
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}

// src/model/discovery.ts
import { readdirSync, realpathSync as realpathSync2, statSync as statSync2 } from "node:fs";
import { basename, dirname, join as join2, sep as sep2 } from "node:path";

// src/model/jsonFile.ts
import { closeSync as closeSync2, fsyncSync, openSync as openSync2, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

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
    rootReal = realpathSync2(root);
    folders = readdirSync(join2(root, ARCHIFY_DIR));
  } catch {
    return [];
  }
  const candidates = [];
  for (const runFolder of folders) {
    const file = join2(root, ARCHIFY_DIR, runFolder, CANDIDATE_FILE);
    try {
      const real = realpathSync2(file);
      if (!real.startsWith(rootReal + sep2)) continue;
      const stat = statSync2(real);
      if (stat.isFile()) candidates.push({ runFolder, file, mtimeMs: stat.mtimeMs });
    } catch {
    }
  }
  return candidates.sort(compareCandidates);
}

// src/model/git.ts
import { spawnSync } from "node:child_process";
import { realpathSync as realpathSync3 } from "node:fs";

// src/model/which.ts
import { accessSync, constants, statSync as statSync3 } from "node:fs";
import { delimiter, join as join3, posix, win32 } from "node:path";
function isExecutableFile(path, platform) {
  try {
    if (!statSync3(path).isFile()) return false;
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
      const candidate = join3(dir, cli + extension);
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
function collectGitFacts(root, env = process.env) {
  const program = gitProgram(env);
  if (program === void 0) return null;
  const top = run(program, root, GIT_READS.topLevel);
  if (top === null) return null;
  try {
    if (realpathSync3(top.trim()) !== realpathSync3(root)) return null;
  } catch {
    return null;
  }
  const head = run(program, root, GIT_READS.head)?.trim().toLowerCase();
  if (head === void 0 || !isRevision(head, "commit")) return null;
  const origin = run(program, root, GIT_READS.origin)?.trim() ?? "";
  const allDirty = parsePorcelainZ(run(program, root, GIT_READS.status) ?? "").filter((path) => !path.startsWith(".archify/"));
  return {
    head,
    origin: origin === "" ? null : sanitizeOrigin(origin),
    dirtyCount: allDirty.length,
    dirty: allDirty.slice(0, MAX_DIRTY_PATHS)
  };
}
function baseReachable(root, base, program = gitProgram()) {
  if (program === void 0 || !isRevision(base, "commit")) return false;
  return run(program, root, [...GIT_READS.commitExists, `${base}^{commit}`]) !== null && run(program, root, [...GIT_READS.isAncestor, base, "HEAD"]) !== null;
}
function readChanges(root, base, program = gitProgram()) {
  if (program === void 0 || !isRevision(base, "commit")) return null;
  const nameStatus = run(program, root, [...GIT_READS.nameStatus, base, "--"]);
  const diff = run(program, root, [...GIT_READS.diff, base, "--"]);
  const untracked = run(program, root, GIT_READS.untracked);
  if (nameStatus === null || diff === null || untracked === null) return null;
  return { nameStatus, diff, untracked };
}
function commitInfo(root, revision, program = gitProgram()) {
  if (program === void 0 || !isRevision(revision, "commit")) return null;
  const output = run(program, root, [...GIT_READS.commitInfo, revision, "--"]);
  const match = output === null ? null : /^([^\0\n]*)\0([^\0\n]+)\n?$/.exec(output);
  if (!match) return null;
  return { subject: match[1], committedAt: match[2] };
}

// src/model/lineage.ts
import { writeFileSync } from "node:fs";
import { join as join4 } from "node:path";

// src/model/runChanges.ts
function fromDiff(diff) {
  if (diff.oldPath === null) return { status: "A", path: diff.newPath ?? "" };
  if (diff.newPath === null) return { status: "D", path: diff.oldPath };
  if (diff.oldPath !== diff.newPath) return { status: "R", path: diff.newPath, oldPath: diff.oldPath };
  return { status: "M", path: diff.newPath };
}
function fromNameStatus(entry) {
  if (entry.status.startsWith("R") && entry.oldPath) return { status: "R", path: entry.path, oldPath: entry.oldPath };
  if (entry.status.startsWith("C") || entry.status === "A") return { status: "A", path: entry.path };
  if (entry.status === "D") return { status: "D", path: entry.path };
  return { status: "M", path: entry.path };
}
function buildRunChanges(map, baseRevision, revision) {
  return {
    baseRevision,
    revision,
    touchedComponents: map.touchedComponents.map((component) => ({ id: component.id, files: component.diffs.map(fromDiff) })),
    uncited: map.uncited.map(fromNameStatus)
  };
}

// src/model/lineage.ts
var LINEAGE_FILE = "lineage.json";
var CHANGES_FILE = "changes.json";
var isCount = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0;
var isNullableString = (value) => value === null || typeof value === "string";
function readCommit(value) {
  if (!isRecord(value)) return null;
  const { subject, committedAt } = value;
  return typeof subject === "string" && typeof committedAt === "string" ? { subject, committedAt } : null;
}
function readRunFile(runDir, file) {
  try {
    return readJson(join4(runDir, file));
  } catch {
    return void 0;
  }
}
function readLineage(runDir) {
  const value = readRunFile(runDir, LINEAGE_FILE);
  if (!isRecord(value)) return null;
  const { mode, reason, previousRun, baseRevision, revision, dirty, dirtyCount, updatesSinceRegeneration } = value;
  if (mode !== "update" && mode !== "regenerate") return null;
  if (typeof reason !== "string" || !isNullableString(previousRun) || !isNullableString(baseRevision) || !isNullableString(revision)) return null;
  if (!Array.isArray(dirty) || !dirty.every((path) => typeof path === "string")) return null;
  if (!isCount(dirtyCount) || !isCount(updatesSinceRegeneration)) return null;
  return {
    mode,
    reason,
    previousRun,
    baseRevision,
    revision,
    baseCommit: readCommit(value["baseCommit"]),
    headCommit: readCommit(value["headCommit"]),
    dirty,
    dirtyCount,
    updatesSinceRegeneration
  };
}
function writeLineage(runDir, lineage) {
  writeFileSync(join4(runDir, LINEAGE_FILE), stringifyDocument(lineage));
}
function writeRunChanges(runDir, changes) {
  writeFileSync(join4(runDir, CHANGES_FILE), stringifyDocument(changes));
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

// src/agent/change-map.ts
var CHANGE_FILE = "change.md";
var MAPPING_FILE = "mapping.md";
var SCRIPT = "change-map.mjs";
var USAGE = "usage: node change-map.mjs --run-folder <runFolder> [--regenerate]";
function previousCandidate(root, run2, slug) {
  const candidate = listCandidates(root).find((c) => c.runFolder !== run2 && parseRunFolderName(c.runFolder)?.slug === slug);
  if (!candidate) return null;
  try {
    return { candidate, doc: JSON.parse(readFileSync2(candidate.file, "utf8")) };
  } catch {
    return null;
  }
}
function main(args) {
  const parsed = parseArgs(args, { options: ["run-folder"], switches: ["regenerate"] });
  const runFolder = parsed?.options["run-folder"];
  if (!parsed || runFolder === void 0 || runFolder === "") return usageError(SCRIPT, USAGE);
  const runDir = resolve(process.cwd(), runFolder);
  const run2 = basename2(runDir);
  const name = parseRunFolderName(run2);
  if (basename2(dirname2(runDir)) !== ARCHIFY_DIR || !name) {
    return usageError(SCRIPT, `expected a run folder of the form <repo>/${ARCHIFY_DIR}/architecture-<slug>-<YYYYMMDD-HHMMSS>[-N], got ${runFolder}`);
  }
  try {
    if (!statSync4(runDir).isDirectory()) return usageError(SCRIPT, `${runFolder} is not a folder`);
  } catch (error) {
    return usageError(SCRIPT, error.message);
  }
  const root = dirname2(dirname2(runDir));
  const previous = previousCandidate(root, run2, name.slug);
  const previousLineage = previous ? readLineage(join5(root, ARCHIFY_DIR, previous.candidate.runFolder)) : null;
  const git = collectGitFacts(root);
  let decision = decideMode({
    requested: parsed.switches.has("regenerate"),
    hasPrevious: previous !== null,
    hasGit: git !== null,
    previousLineage,
    candidateRevision: previous ? candidateRevision(previous.doc) : null,
    baseReachable: (base) => baseReachable(root, base)
  });
  const report = {
    mode: decision.mode,
    reason: decision.reason,
    previous: previous ? `${ARCHIFY_DIR}/${previous.candidate.runFolder}/${CANDIDATE_FILE}` : null,
    baseRevision: decision.base,
    head: git?.head ?? null,
    changeFile: null,
    mappingFile: null,
    touchedComponents: [],
    untouchedComponents: [],
    uncitedFiles: []
  };
  try {
    if (decision.mode === "update" && previous && git) {
      const components = diagramComponents(previous.doc);
      const cited = new Set(components.flatMap((component) => [...component.paths]));
      const reads = readChanges(root, decision.base);
      const rootReal = realpathSync4(root);
      const changes = reads && collectChanges({
        ...reads,
        previousDirty: previousLineage?.dirty ?? [],
        cited,
        exists: (path) => existsSync(join5(root, path)),
        readUntracked: (path) => citationPathOk(path) && probeFile(rootReal, path).kind === "text" ? readFileSync2(join5(rootReal, path), "utf8") : null
      });
      const map = changes && mapChanges(components, changes);
      const change = map && renderChange(decision.base, git.head, map);
      if (!map || !change || Buffer.byteLength(change, "utf8") > MAX_CHANGE_BYTES) {
        decision = { mode: "regenerate", reason: "change-too-large", base: decision.base };
        Object.assign(report, { mode: decision.mode, reason: decision.reason });
      } else {
        writeFileSync2(join5(runDir, CHANGE_FILE), change);
        writeFileSync2(join5(runDir, MAPPING_FILE), renderMapping(decision.base, git.head, map));
        writeRunChanges(runDir, buildRunChanges(map, decision.base, git.head));
        Object.assign(report, {
          changeFile: `${ARCHIFY_DIR}/${run2}/${CHANGE_FILE}`,
          mappingFile: `${ARCHIFY_DIR}/${run2}/${MAPPING_FILE}`,
          touchedComponents: map.touchedComponents.map((component) => component.id),
          untouchedComponents: map.untouched.map((component) => component.id),
          uncitedFiles: map.uncited.map((entry) => entry.path)
        });
      }
    }
    const lineage = {
      mode: decision.mode,
      reason: decision.reason,
      previousRun: previous?.candidate.runFolder ?? null,
      baseRevision: decision.base,
      revision: git?.head ?? null,
      baseCommit: git && decision.base !== null ? commitInfo(root, decision.base) : null,
      headCommit: git ? commitInfo(root, git.head) : null,
      dirty: git?.dirty ?? [],
      dirtyCount: git?.dirtyCount ?? 0,
      updatesSinceRegeneration: decision.mode === "update" ? (previousLineage?.updatesSinceRegeneration ?? 0) + 1 : 0
    };
    writeLineage(runDir, lineage);
  } catch (error) {
    return usageError(SCRIPT, error.message);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
