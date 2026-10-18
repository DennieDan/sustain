// UI-02: runs an agent CLI headless and turns its output into the run card's state. No
// `vscode` import, so spawning, cancelling and parsing are unit-tested against a stub agent.
import { spawn } from "node:child_process";
import { extname, join } from "node:path";
import type { StreamParser } from "../model/agentStream/feed";
import { RunTracker, type RunState } from "../model/agentStream/tracker";

/** How long a cancelled run gets to exit before it is killed outright. */
export const KILL_GRACE_MS = 3_000;

/** The end of stderr kept for a failed run's message. */
const STDERR_TAIL = 2_000;

export interface HeadlessRun {
  readonly state: RunState;
  /** Stops the agent and everything it started. */
  cancel(): void;
  /** Settles when the process has exited. */
  readonly done: Promise<RunState>;
}

/**
 * Whether `binary` can start without a shell. Windows starts `.cmd` and `.bat` files only
 * through `cmd.exe`, which would parse the user's focus text; those agents run in a terminal.
 */
export function canRunHeadless(binary: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "win32" || ![".cmd", ".bat"].includes(extname(binary).toLowerCase());
}

/** Kills the process tree of a child started with {@link startHeadless}. */
function killTree(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === "win32") {
      const taskkill = join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "taskkill.exe");
      spawn(taskkill, ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      // The child leads its own process group, so the negative pid reaches everything it started.
      process.kill(-pid, signal);
    }
  } catch {
    // Already gone.
  }
}

/**
 * Starts `binary` (an absolute path, SAF-04) with `args` in `cwd`, feeding stdout to `parser`.
 * `onChange` runs after every chunk and once at the end.
 */
export function startHeadless(binary: string, args: string[], cwd: string, parser: StreamParser, onChange: (state: RunState) => void, env: NodeJS.ProcessEnv = process.env): HeadlessRun {
  const tracker = new RunTracker(parser);
  let cancelled = false;
  let exited = false;
  let stderr = "";

  const child = spawn(binary, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", windowsHide: true });
  const done = new Promise<RunState>((resolve) => {
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      tracker.push(chunk);
      onChange(tracker.state);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL);
    });
    const settle = (code: number | null, error?: Error): void => {
      if (exited) return;
      exited = true;
      const state = tracker.finish(code, cancelled);
      const reason = error?.message ?? stderr.trim().split("\n").pop()?.trim();
      if (state.status === "failed" && reason) state.feed.push({ kind: "error", text: reason });
      onChange(state);
      resolve(state);
    };
    child.on("error", (error) => settle(null, error));
    child.on("close", (code) => settle(code));
  });

  return {
    state: tracker.state,
    done,
    cancel() {
      if (exited || child.pid === undefined) return;
      cancelled = true;
      killTree(child.pid, "SIGTERM");
      setTimeout(() => {
        if (!exited && child.pid !== undefined) killTree(child.pid, "SIGKILL");
      }, KILL_GRACE_MS).unref();
    },
  };
}
