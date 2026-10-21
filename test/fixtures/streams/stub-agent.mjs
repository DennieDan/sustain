// A stand-in agent CLI for the UI-02 and UI-06 tests. It ignores its arguments except to record
// them, and acts per SUSTAIN_STUB:
// - "replay" (the default): prints the lines of SUSTAIN_STUB_STREAM; with SUSTAIN_STUB_CANDIDATE,
//   first writes that diagram as an accepted run in .archify/ under the working directory.
// - "hang": starts a child that never exits, writes both pids to SUSTAIN_STUB_PIDS, then waits.
// SUSTAIN_STUB_ARGS, when set, receives the argument vector as JSON. `--version` prints a version.
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;
if (env.SUSTAIN_STUB_ARGS) writeFileSync(env.SUSTAIN_STUB_ARGS, JSON.stringify(process.argv.slice(2)));

if (process.argv[2] === "--version") {
  process.stdout.write("9.9.9 (stub)\n");
} else if (env.SUSTAIN_STUB === "hang") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(String(env.SUSTAIN_STUB_PIDS), JSON.stringify([process.pid, child.pid]));
  process.stdout.write(`${JSON.stringify({ type: "system", subtype: "init", session_id: "hang" })}\n`);
  setInterval(() => {}, 1000);
} else {
  if (env.SUSTAIN_STUB_CANDIDATE) {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const dir = join(process.cwd(), ".archify", `architecture-stub-${stamp}`);
    mkdirSync(dir, { recursive: true });
    copyFileSync(env.SUSTAIN_STUB_CANDIDATE, join(dir, "candidate.sir"));
    const record = { schema: 1, kind: "full", focus: "", paths: [], base: null, parent: null, createdAt: now.toISOString(), skillVersion: "stub", phase: "accepted", attempts: 1, finishedAt: now.toISOString() };
    writeFileSync(join(dir, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
  }
  const lines = readFileSync(String(env.SUSTAIN_STUB_STREAM), "utf8").split("\n").filter((/** @type {string} */ line) => line.trim() !== "");
  let index = 0;
  const next = () => {
    if (index >= lines.length) return;
    process.stdout.write(`${lines[index++]}\n`);
    setTimeout(next, Number(env.SUSTAIN_STUB_DELAY ?? 0));
  };
  next();
}
