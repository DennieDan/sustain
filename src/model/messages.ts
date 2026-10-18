// Messages between the extension host and the webviews (FR-VIEW-04). Types only.
import type { FeedItem, StreamUsage } from "./agentStream/feed";
import type { RunStatus } from "./agentStream/tracker";
import type { LeaderboardEntry } from "./leaderboard";
import type { Check, CheckId } from "./preflight";
import type { RunPhase } from "./runRecord";

/** Host → architecture webview. `doc` is the parsed diagram JSON; `file` its absolute path. */
export type HostMessage = { type: "load"; doc: unknown; file: string } | { type: "empty"; message: string };

/** Architecture webview → host. `index` is into the component's tolerant `sources` list. */
export type WebviewMessage = { type: "ready" } | { type: "openSource"; componentId: string; index: number };

/** What the session webview renders — public `session.json` fields plus the leaderboard. */
export interface SessionView {
  /** The shown run folder name (`.sustain/<run>`), or `null` when no session exists. */
  run: string | null;
  /** Whether `.sustain/active` names a live run — `false` means the shown run is history. */
  live: boolean;
  mode: string;
  phase: string;
  /** Live phase a paused session returns to, when set. */
  pausedFrom: string | null;
  stepIndex: number;
  stepsTotal: number;
  stepTitle: string | null;
  bugs: number;
  found: number;
  fixed: number;
  score: number;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
  /** Host time at send — the webview's elapsed timer offsets from this. */
  serverNow: string;
  leaderboard: LeaderboardEntry[];
  /** Sum of every leaderboard score — the user's accumulated points across runs. */
  totalScore: number;
}

/** Host → session webview. */
export type SessionHostMessage = { type: "session"; view: SessionView } | { type: "empty"; message: string };

/** Session webview → host. */
export type SessionWebviewMessage = { type: "ready" };

/** Where a Generate runs: streamed into the sidebar (UI-02) or in a terminal. */
export type RunMode = "sidebar" | "terminal";

/** The sidebar's run card (UI-02, CST-04). */
export interface RunCard {
  /** The agent's label, such as "Claude Code". */
  agent: string;
  mode: RunMode;
  focus: string;
  status: RunStatus;
  /** From `run.json` once the agent has created the run folder. */
  phase: RunPhase | null;
  attempts: number;
  runFolder: string | null;
  feed: FeedItem[];
  usage: StreamUsage;
  costUsd: number | null;
  /** Tools the agent was refused, as "Tool: detail". */
  denials: string[];
  startedAt: string;
  finishedAt: string | null;
}

/** One entry of the sidebar's maps list (UI-01). */
export interface MapItem {
  runFolder: string;
  /** Absolute path of `candidate.json`. */
  file: string;
  title: string | null;
  focus: string;
  agent: string | null;
  /** When the run started: `run.json`'s `createdAt`, else the candidate's modification time. */
  createdAt: string;
  boxes: number | null;
}

/** An agent the composer offers: found on PATH, with whether it can stream into the sidebar. */
export interface ComposerAgent {
  cli: "claude" | "codex";
  label: string;
  headless: boolean;
}

/** The learning-session summary at the foot of the sidebar. */
export interface SessionSummary {
  phase: string;
  stepIndex: number;
  stepsTotal: number;
  score: number;
}

/** Everything the sidebar renders, sent whole on every change. */
export interface HomeState {
  /** Workspace folders; the picker shows when there are several. */
  folders: { name: string; root: string }[];
  /** The folder the sidebar works on, or `null` when none is open. */
  root: string | null;
  maps: MapItem[];
  composer: {
    agents: ComposerAgent[];
    /** The remembered agent, or the first one found. */
    agent: "claude" | "codex" | null;
    runMode: RunMode;
    /** What the next Generate click will also do (SET-03): installs, repairs, the data note. */
    notes: string[];
  };
  run: RunCard | null;
  /** SET-02's checks, or `null` while they run. */
  setup: Check[] | null;
  session: SessionSummary | null;
  /** Host time at send, for the run card's elapsed time. */
  serverNow: string;
}

/** Host → sidebar. */
export type HomeHostMessage = { type: "state"; state: HomeState };

/** Sidebar → host. */
export type HomeWebviewMessage =
  | { type: "ready" }
  | { type: "pickFolder"; root: string }
  | { type: "setAgent"; agent: "claude" | "codex" }
  | { type: "setRunMode"; runMode: RunMode }
  | { type: "generate"; focus: string }
  | { type: "cancelRun" }
  | { type: "runInTerminal" }
  | { type: "openMap"; file: string }
  | { type: "deleteMap"; file: string }
  | { type: "fix"; check: CheckId }
  | { type: "checkSetup" }
  | { type: "openSession" }
  | { type: "startLearning" };
