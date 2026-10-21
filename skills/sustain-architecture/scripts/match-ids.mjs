// src/agent/match-ids.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// src/core-node/jsonFile.ts
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";

// src/core/types.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringifyDocument(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}

// src/core-node/jsonFile.ts
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// src/core/matchIds.ts
var MATCH_THRESHOLD = 0.3;
function objects(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function idOf(value) {
  return typeof value.id === "string" ? value.id : void 0;
}
function keyed(components) {
  const out = [];
  for (const c of components) {
    const id = idOf(c);
    if (id === void 0) continue;
    const files = /* @__PURE__ */ new Set();
    for (const source of objects(c.sources)) if (typeof source.path === "string") files.add(source.path);
    out.push({ id, label: c.label, files });
  }
  return out;
}
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const value of a) if (b.has(value)) inter++;
  return inter / (a.size + b.size - inter);
}
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function greedyMatch(previous, draft, threshold) {
  const candidates = [];
  for (const p of previous) {
    for (const d of draft) {
      const similarity = jaccard(p.files, d.files);
      if (similarity > 0 && similarity >= threshold) candidates.push({ p, d, similarity });
    }
  }
  candidates.sort((x, y) => y.similarity - x.similarity || Number(y.p.label === y.d.label) - Number(x.p.label === x.d.label) || cmp(x.p.id, y.p.id) || cmp(x.d.id, y.d.id));
  const usedPrevious = /* @__PURE__ */ new Set();
  const usedDraft = /* @__PURE__ */ new Set();
  const out = [];
  for (const { p, d } of candidates) {
    if (usedPrevious.has(p.id) || usedDraft.has(d.id)) continue;
    usedPrevious.add(p.id);
    usedDraft.add(d.id);
    out.push({ previous: p.id, draft: d.id });
  }
  return out;
}
function freshId(id, avoid) {
  const taken = /* @__PURE__ */ new Set();
  for (const set of avoid) for (const value of set) taken.add(value);
  for (let n = 1; ; n++) {
    const candidate = `${id}-n${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
function matchIds(previous, draft, threshold = MATCH_THRESHOLD) {
  if (!(threshold > 0 && threshold <= 1)) throw new Error(`invalid match threshold ${threshold}`);
  if (!Array.isArray(draft.components)) throw new Error("draft has no components array");
  const prev = isRecord(previous) ? previous : {};
  const prevComponents = keyed(objects(prev.components));
  const draftComponents = objects(draft.components);
  const componentMap = /* @__PURE__ */ new Map();
  for (const m of greedyMatch(prevComponents, keyed(draftComponents), threshold)) componentMap.set(m.draft, m.previous);
  const previousIds = new Set(prevComponents.map((c) => c.id));
  const assigned = new Set(componentMap.values());
  const renamed = {};
  const taken = new Set(assigned);
  for (const c of draftComponents) {
    const id = idOf(c);
    if (id !== void 0 && !componentMap.has(id)) taken.add(id);
  }
  for (const c of draftComponents) {
    const id = idOf(c);
    if (id === void 0 || componentMap.has(id)) continue;
    if (!previousIds.has(id)) {
      componentMap.set(id, id);
      continue;
    }
    const fresh = freshId(id, [taken, previousIds]);
    taken.add(fresh);
    renamed[id] = fresh;
    componentMap.set(id, fresh);
  }
  const mapComponent = (id) => typeof id === "string" ? componentMap.get(id) ?? id : id;
  const previousByEndpoints = /* @__PURE__ */ new Map();
  const previousConnectionIds = /* @__PURE__ */ new Set();
  for (const c of objects(prev.connections)) {
    const id = idOf(c);
    if (id === void 0 || typeof c.from !== "string" || typeof c.to !== "string") continue;
    previousConnectionIds.add(id);
    const key = `${c.from}\0${c.to}`;
    previousByEndpoints.set(key, [...previousByEndpoints.get(key) ?? [], id]);
  }
  const draftConnectionIds = objects(draft.connections).map(idOf).filter((id) => id !== void 0);
  const usedConnectionIds = /* @__PURE__ */ new Set();
  const connectionMap = {};
  const mapConnection = (c) => {
    if (!isRecord(c)) return c;
    const from = mapComponent(c.from);
    const to = mapComponent(c.to);
    const bothMatched = typeof from === "string" && typeof to === "string" && assigned.has(from) && assigned.has(to);
    const candidates = bothMatched ? (previousByEndpoints.get(`${from}\0${to}`) ?? []).filter((id2) => !usedConnectionIds.has(id2)) : [];
    const original = idOf(c);
    let id = original;
    if (candidates.length > 0) id = candidates[0];
    else if (id !== void 0 && previousConnectionIds.has(id)) {
      id = freshId(id, [usedConnectionIds, previousConnectionIds, draftConnectionIds]);
    }
    if (id !== void 0) {
      usedConnectionIds.add(id);
      if (original !== void 0 && id !== original) connectionMap[original] = id;
    }
    return { ...c, ...id !== void 0 ? { id } : {}, from, to };
  };
  const diagram = { ...draft };
  diagram.components = draft.components.map((c) => isRecord(c) && idOf(c) !== void 0 ? { ...c, id: mapComponent(c.id) } : c);
  if (Array.isArray(draft.connections)) diagram.connections = draft.connections.map(mapConnection);
  if (Array.isArray(draft.boundaries)) {
    diagram.boundaries = draft.boundaries.map((b) => isRecord(b) && Array.isArray(b.wraps) ? { ...b, wraps: b.wraps.map(mapComponent) } : b);
  }
  return { diagram, componentMap: Object.fromEntries(componentMap), connectionMap, renamed };
}

// src/core-node/scriptArgs.ts
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

// src/agent/match-ids.ts
var SCRIPT = "match-ids.mjs";
function readInput(path, what) {
  try {
    return { value: readJson(path) };
  } catch (error) {
    const message = error.message;
    return { error: error instanceof SyntaxError ? `${what} is not valid JSON: ${message}` : `cannot read ${what}: ${message}` };
  }
}
function main(args) {
  const parsed = parseArgs(args, { positionals: 1, options: ["previous"] });
  const previousArg = parsed?.options["previous"];
  if (!parsed || previousArg === void 0) return usageError(SCRIPT, "usage: node match-ids.mjs <draft> --previous <candidate>");
  const draftPath = resolve(process.cwd(), parsed.positionals[0]);
  const previousPath = resolve(process.cwd(), previousArg);
  const draft = readInput(draftPath, "draft");
  if ("error" in draft) return usageError(SCRIPT, draft.error);
  const previous = readInput(previousPath, "previous candidate");
  if ("error" in previous) return usageError(SCRIPT, previous.error);
  if (!isRecord(draft.value) || !Array.isArray(draft.value.components)) {
    return usageError(SCRIPT, "draft must be a JSON object with a components array");
  }
  if (!isRecord(previous.value)) return usageError(SCRIPT, "previous candidate must be a JSON object");
  const { diagram, componentMap, connectionMap, renamed } = matchIds(previous.value, draft.value);
  try {
    writeFileSync(draftPath, stringifyDocument(diagram));
  } catch (error) {
    return usageError(SCRIPT, `cannot write draft: ${error.message}`);
  }
  process.stdout.write(`${JSON.stringify({ componentMap, connectionMap, renamed }, null, 2)}
`);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
