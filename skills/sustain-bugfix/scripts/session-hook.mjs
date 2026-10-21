// src/agent/session-hook.ts
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { dirname, join as join2 } from "node:path";

// src/model/session.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync as readFileSync2 } from "node:fs";
import { join } from "node:path";

// src/core-node/jsonFile.ts
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";

// src/core/types.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/core-node/jsonFile.ts
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// src/core-node/runFolder.ts
var RUN_NAME_PATTERN = /^([a-z0-9]+)-(.+)-(\d{8}-\d{6})(?:-(\d+))?$/;
function parseRunName(name) {
  const match = RUN_NAME_PATTERN.exec(name);
  if (!match) return null;
  return { prefix: match[1], slug: match[2], timestamp: match[3], n: match[4] === void 0 ? 1 : Number(match[4]) };
}

// src/model/session.ts
var SUSTAIN_DIR = ".sustain";
var ACTIVE_FILE = "active";
var SESSION_FILE = "session.json";
var SESSION_PHASES = ["clarify", "implementing", "hunting", "paused", "done"];
var LIVE_PHASES = ["clarify", "implementing", "hunting"];
var SESSION_MODES = ["bugfix"];
var STALE_IDLE_MS = 24 * 60 * 60 * 1e3;
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
function readJsonFile(runDir, file, check) {
  let value;
  try {
    value = readJson(join(runDir, file));
  } catch (error) {
    throw new Error(`${file} is unreadable: ${error.message}`);
  }
  return check(value, file);
}
function loadSession(runDir) {
  return readJsonFile(runDir, SESSION_FILE, checkSession);
}
function activeRun(root) {
  try {
    const run = readFileSync2(join(root, SUSTAIN_DIR, ACTIVE_FILE), "utf8").trim();
    return run !== "" && parseRunName(run) !== null ? run : null;
  } catch {
    return null;
  }
}

// src/agent/session-hook.ts
var BLOCKED_TOOLS = /* @__PURE__ */ new Set(["edit", "write", "apply_patch", "notebook_edit", "run_subagent", "Edit", "Write", "NotebookEdit", "Agent"]);
function projectRoot(payload) {
  const named = process.env["DEVIN_PROJECT_DIR"] || process.env["CLAUDE_PROJECT_DIR"];
  if (named) return named;
  const start = typeof payload["cwd"] === "string" && payload["cwd"] !== "" ? payload["cwd"] : process.cwd();
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync2(join2(dir, SUSTAIN_DIR, ACTIVE_FILE))) return dir;
    if (dirname(dir) === dir) return start;
  }
}
var SESSION_MJS = ".agents/skills/sustain-bugfix/scripts/session.mjs";
function contextLine(run, session) {
  const step = session.steps[session.stepIndex];
  const here = session.steps.length === 0 ? "no steps planned yet" : `step ${Math.min(session.stepIndex + 1, session.steps.length)}/${session.steps.length}${step ? ` "${step.title}"` : ""}`;
  const base = `[sustain-bugfix] active session ${run}: phase=${session.phase}, ${here}, bugs ${session.found} found / ${session.fixed} fixed of ${session.bugs}, score ${session.score}.`;
  switch (session.phase) {
    case "hunting":
      return `${base} The user is hunting the seeded bug themselves: do not edit files, do not spawn subagents, never reveal locations/lines/kinds or per-file counts. Judge their description, then run \`node ${SESSION_MJS} report --file <f>\`; when they say a fix is in, run \`node ${SESSION_MJS} verify\`.`;
    case "implementing":
      return `${base} Implement the current step, seed one bug with \`node ${SESSION_MJS} inject\`, announce only the step's touched files, then wait for the user.`;
    case "clarify":
      return `${base} Clarify the task with the user, then run \`node ${SESSION_MJS} plan\`.`;
    case "paused":
      return `${base} The session is paused \u2014 enforcement is inert. \`node ${SESSION_MJS} resume\` re-arms it, \`abandon\` restores the seeded code and ends it.`;
    default:
      return `${base} All steps are verified \u2014 run \`node ${SESSION_MJS} complete\` to score the session and release the lock.`;
  }
}
function block(run, tool) {
  const reason = `Sustain bug-hunt is live (run ${run}): the user is finding and fixing the seeded bug themselves, so \`${tool}\` is denied while session.json phase is "hunting". Coach with session.mjs status/report/hint/verify instead.`;
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}
`);
  process.stderr.write(`${reason}
`);
  return 2;
}
function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync3(0, "utf8"));
  } catch {
    return 0;
  }
  const root = projectRoot(payload);
  const run = activeRun(root);
  if (run === null) return 0;
  let session;
  try {
    session = loadSession(join2(root, SUSTAIN_DIR, run));
  } catch {
    return 0;
  }
  const event = payload["hook_event_name"];
  if (event === "PreToolUse") {
    const tool = payload["tool_name"];
    if (session.phase === "hunting" && typeof tool === "string" && BLOCKED_TOOLS.has(tool)) return block(run, tool);
    return 0;
  }
  if (event === "UserPromptSubmit" || event === "PostCompaction" || event === "SessionStart") {
    const output = { hookSpecificOutput: { hookEventName: event, additionalContext: contextLine(run, session) } };
    process.stdout.write(`${JSON.stringify(output)}
`);
    return 0;
  }
  return 0;
}
process.exitCode = main();
