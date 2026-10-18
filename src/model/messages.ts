// Messages between the extension host and the webviews (FR-VIEW-04). Types only.
import type { HealthItem, HealthKind } from "./health";
import type { MapDiff } from "./diff";
import type { FeedItem, StreamUsage } from "./agentStream/feed";
import type { Block, Span } from "./ask";
import type { RunStatus } from "./agentStream/tracker";
import type { LeaderboardEntry } from "./leaderboard";
import type { Grade } from "./practice";
import type { Check, CheckId } from "./preflight";
import type { RunPhase } from "./runRecord";
import type { Freshness } from "./staleness";
import type { TourStop } from "./tour";

/**
 * Host → architecture webview. `doc` is the parsed diagram JSON; `file` its absolute path. An
 * empty state may offer to map the folder (UI-03). `highlight` marks the boxes citing `file`, a
 * repository-relative path, or clears the marks when it is `null` (UI-03).
 */
export type HostMessage =
  | { type: "load"; doc: unknown; file: string }
  | { type: "empty"; message: string; action?: "mapFolder" }
  | { type: "highlight"; ids: string[]; file: string | null; follow: boolean }
  /** FRS-03: each box's state against the code, and the header when boxes changed. */
  | { type: "freshness"; boxes: Record<string, Freshness>; header: string | null }
  /** FRS-04: boxes a diff touched, or `null` to clear the overlay. */
  | { type: "changes"; overlay: ChangeOverlay | null }
  /** PRC-02: new box candidates drawn as dashed ghost boxes, and PRC-06's new arrows as dashed ghost arrows; never written. */
  | { type: "ghosts"; ghosts: Ghost[]; arrows?: GhostArrow[] }
  /** FRS-07: the shown map compared with an older one, or `null` to clear. */
  | { type: "compare"; compare: { against: string; diff: MapDiff } | null }
  /** ARC-03: each box's heat level (0 to 4) and tooltip line, and whether the Hotspots toggle shows them. */
  | { type: "hotspots"; boxes: Record<string, { level: number; note: string }>; shown: boolean }
  /** ARC-01: imports that break the rules, as red arrows between the boxes, labelled with the rules. */
  | { type: "violations"; arrows: { from: string; to: string; label: string }[] }
  /** ACC-03: doubtful boxes and unbacked arrows, and whether the map's Checks are shown. */
  | { type: "uncertainty"; boxes: Record<string, string>; edges: number[]; shown: boolean }
  /** SKL-02: the shown map's tour, or `null` when it has none. */
  | { type: "tour"; stops: TourStop[] | null }
  /** SKL-02: play the tour from its first stop. */
  | { type: "playTour" }
  /** VWR-03: open the finder, for Find in the map's title bar. */
  | { type: "find" };

/** A new box candidate on the map (PRC-02). */
export interface Ghost {
  label: string;
  files: number;
}

/** A new arrow candidate between two boxes of the map, by id (PRC-06). */
export interface GhostArrow {
  from: string;
  to: string;
}

/** What Show Changes found for the shown map (FRS-04). */
export interface ChangeOverlay {
  /** The scope's name, such as "Uncommitted changes". */
  scope: string;
  strong: string[];
  weak: string[];
  /** Changed files no box cites. */
  uncovered: string[];
}

/** Architecture webview → host. `index` is into the component's tolerant `sources` list. */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "openSource"; componentId: string; index: number }
  | { type: "setFollow"; on: boolean }
  | { type: "mapFolder" }
  | { type: "clearChanges" }
  /** FRS-07: the compare bar's Clear. */
  | { type: "clearCompare" }
  | { type: "refresh" }
  /** SKL-02: the tour showed stop `index`, or its citation was clicked. */
  | { type: "tourStop"; index: number }
  | { type: "openTourCode"; index: number }
  /** SKL-03: the tour was played to its last stop and finished. */
  | { type: "tourFinished" };

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
  /** Absolute path of `candidate.json`. */
  file: string;
  title: string | null;
  focus: string;
  agent: string | null;
  /** When the run started: `run.json`'s `createdAt`, else the candidate's modification time. */
  createdAt: string;
  boxes: number | null;
  /** Boxes whose code was edited or is missing (FRS-03), or `null` without fingerprints. */
  changed: number | null;
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

/** One question and its answer in the sidebar's Ask section (UI-06). */
export interface AskTurn {
  question: string;
  agent: string;
  status: RunStatus;
  /** The answer, with only the citations the host checked left as links. */
  blocks: Block[];
  usage: StreamUsage;
  costUsd: number | null;
  /** Why the answer failed, when it did. */
  error: string | null;
}

export interface AskView {
  /** Why a question cannot be asked now, or `null` when it can. */
  blocked: string | null;
  turns: AskTurn[];
  /** What a question costs (CST-03), and whether it needs a second click. */
  estimate: string | null;
  confirm: boolean;
}

/** One explain-back question in the sidebar (SKL-01). Its expected answer stays in the extension host. */
export interface PracticeQuestionView {
  question: string;
  /** The user's answer, once sent. */
  answer: string | null;
  status: "open" | "grading" | "graded" | "failed";
  /** The grade, with its citation only when the host found the file citable. */
  grade: { grade: Grade; reason: string; cite: Extract<Span, { kind: "cite" }> | null } | null;
  error: string | null;
}

/** One entry of the practice log (SKL-03). `at` is an ISO date and time. */
export interface PracticeLogEntry {
  kind: "hunt" | "explain" | "tour";
  title: string;
  detail: string;
  at: string;
}

/** The sidebar's Practice section (SKL-01, SKL-03). */
export interface PracticeView {
  /** Why a check cannot start now, or `null` when it can. */
  blocked: string | null;
  /** What one run of the check costs (CST-03), and whether starting needs a second click. */
  estimate: string | null;
  confirm: boolean;
  /** The folder's latest check, or `null` before the first. */
  check: { scope: string; status: RunStatus; error: string | null; questions: PracticeQuestionView[] } | null;
  /** SKL-03: finished bug hunts, explain-backs and tours, newest first. */
  log: PracticeLogEntry[];
}

/** The sidebar's Rules section (ARC-02). */
export interface RulesView {
  /** The map the rules use, or `null` without one. */
  map: string | null;
  rules: { id: string; reason: string; violations: number }[];
}

/** The sidebar's Review changes section (PRC-02). */
export interface ReviewView {
  scope: string;
  /** Why the review could not run. */
  error: string | null;
  counts: { touched: number; stale: number; gone: number; uncovered: number; candidates: number; arrows: number } | null;
  candidates: { dir: string; label: string; lines: number; files: string[] }[];
  /** PRC-03: the branch's map and the base map, when the branch's map is the newer. */
  branchMap: { map: string; base: string } | null;
  /** PRC-03: whether there are candidates or stale boxes for "Update map for this branch". */
  canUpdate: boolean;
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
    /** What the next Generate click will also do (SET-03): the estimate (CST-03), installs, repairs, the data note. */
    notes: string[];
    /** Whether Generate needs a second click, the estimate being above `sustain.confirmAboveTokens` (CST-03). */
    confirm: boolean;
  };
  run: RunCard | null;
  /** SET-02's checks, or `null` while they run. */
  setup: Check[] | null;
  session: SessionSummary | null;
  ask: AskView;
  review: ReviewView | null;
  /** SKL-01: the explain-back. */
  practice: PracticeView;
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
  | { type: "setAgent"; agent: "claude" | "codex" }
  | { type: "setRunMode"; runMode: RunMode }
  | { type: "generate"; focus: string; confirmed?: boolean }
  | { type: "cancelRun" }
  | { type: "runInTerminal" }
  | { type: "openMap"; file: string }
  | { type: "deleteMap"; file: string }
  | { type: "refreshMap"; file: string }
  | { type: "exportMap"; file: string }
  | { type: "review" }
  | { type: "suggestRules" }
  | { type: "compareBase" }
  | { type: "updateBranchMap" }
  | { type: "openHealth"; item: HealthKind }
  | { type: "showFiles"; dir: string }
  | { type: "addToMap"; dir: string }
  | { type: "ignoreCandidate"; dir: string }
  | { type: "fix"; check: CheckId }
  | { type: "checkSetup" }
  | { type: "openSession" }
  | { type: "startLearning" }
  | { type: "ask"; question: string; confirmed?: boolean }
  | { type: "cancelAsk" }
  | { type: "clearAsk" }
  | { type: "openCitation"; path: string; line: number; endLine: number | null }
  | { type: "focusBox"; id: string }
  | { type: "practiceStart"; scope: "branch" | "uncommitted" | "box"; confirmed?: boolean }
  | { type: "practiceAnswer"; index: number; answer: string }
  | { type: "practiceCancel" }
  | { type: "practiceClear" }
  | { type: "createTour"; file: string };
