// Messages between the extension host and the webviews (FR-VIEW-04, FR-CMP-05, FR-CMP-07).
// Types only.
import type { HealthItem, HealthKind } from "./health";
import type { FeedItem, StreamUsage } from "./agentStream/feed";
import type { RunStatus } from "./agentStream/tracker";
import type { LeaderboardEntry } from "./leaderboard";
import type { Check, CheckId } from "../core-node/preflight";
import type { RunPhase } from "../core-node/runRecord";
import type { ComparisonContext } from "../core/comparison";
import type { RunChanges } from "../core/runChanges";

/** The baseline the open diagram is compared with, and what the host knows about the pair (FR-CMP-05). */
export interface Compare {
  /** Parsed baseline JSON; the webview runs the tolerant parse on it. */
  baselineDoc: unknown;
  /** Absolute path of the baseline diagram (normally a `candidate.sir`). */
  baselineFile: string;
  context: ComparisonContext;
  /** The open run's `changes.json` when `context.keptAvailable`, else `null`. */
  changes: RunChanges | null;
}

/**
 * Host → architecture webview. `doc` is the parsed diagram JSON; `file` its absolute path. An
 * empty state may offer to map the folder (UI-03).
 */
export type HostMessage =
  | { type: "load"; doc: unknown; file: string; compare?: Compare | null }
  | { type: "empty"; message: string; action?: "mapFolder" };

/**
 * Architecture webview → host. `index` is into the component's tolerant `sources` list; `path` in
 * `openFile` is a repo-relative path from the `changes` last sent (FR-CMP-07).
 */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "openSource"; componentId: string; index: number }
  | { type: "compareWith" }
  | { type: "openBaseline" }
  | { type: "swap" }
  | { type: "openFile"; path: string }
  | { type: "mapFolder" };

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
  /** The estimate stated before the run (CST-03). */
  estimate: string | null;
  /** Tools the agent was refused, as "Tool: detail". */
  denials: string[];
  startedAt: string;
  finishedAt: string | null;
}

/** One entry of the sidebar's maps list (UI-01). */
export interface MapItem {
  runFolder: string;
  /** Absolute path of `candidate.sir`. */
  file: string;
  title: string | null;
  focus: string;
  agent: string | null;
  /** When the run started: `run.json`'s `createdAt`, else the candidate's modification time. */
  createdAt: string;
  boxes: number | null;
}

/** The agents the composer can launch (RCH-04 adds Devin, which runs in a terminal). */
export type ComposerCli = "claude" | "codex" | "devin";

/** An agent the composer offers: found on PATH, with whether it can stream into the sidebar. */
export interface ComposerAgent {
  cli: ComposerCli;
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

/** The sidebar's Rules section (ARC-02). */
export interface RulesView {
  /** The map the rules use, or `null` without one. */
  map: string | null;
  rules: { id: string; reason: string; violations: number }[];
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
    agent: ComposerCli | null;
    runMode: RunMode;
    /** What the next Generate click will also do (SET-03): the estimate (CST-03), installs, repairs, the data note. */
    notes: string[];
    /** Whether Generate needs a second click, the estimate being above `sustain.confirmAboveTokens` (CST-03). */
    confirm: boolean;
  };
  run: RunCard | null;
  /** SET-02's checks, or `null` while they run. */
  setup: Check[] | null;
  session: SessionSummary | null;
  /** ARC-02: the folder's rules with their violation counts, or `null` without a folder. */
  rules: RulesView | null;
  /** ARC-05: the Health section's lines, or `null` without a main map. */
  health: HealthItem[] | null;
  /** ARC-03: the five most changed boxes of the rules map over the window, or `null` without one. */
  hotspots: { days: number; boxes: { id: string; label: string; commits: number; lines: number }[] } | null;
  /** Host time at send, for the run card's elapsed time. */
  serverNow: string;
}

/** Host → sidebar. */
export type HomeHostMessage = { type: "state"; state: HomeState };

/** Sidebar → host. */
export type HomeWebviewMessage =
  | { type: "ready" }
  | { type: "pickFolder"; root: string }
  | { type: "setAgent"; agent: ComposerCli }
  | { type: "setRunMode"; runMode: RunMode }
  | { type: "generate"; focus: string; confirmed?: boolean }
  | { type: "cancelRun" }
  | { type: "runInTerminal" }
  | { type: "openMap"; file: string }
  | { type: "deleteMap"; file: string }
  | { type: "suggestRules" }
  | { type: "openHealth"; item: HealthKind }
  | { type: "fix"; check: CheckId }
  | { type: "checkSetup" }
  | { type: "openSession" }
  | { type: "startLearning" }
  /** RCH-04: copy the Generate prompt for an agent Sustain does not launch. */
  | { type: "copyPromptFor"; focus: string };
