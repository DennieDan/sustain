// CST-03: the estimate every token-spending action shows, from the folder's size (CST-01). Sizes
// are cached per folder for a minute, since the sidebar asks on every change.
import * as vscode from "vscode";
import { runEstimate, type EstimateAgent, type EstimateKind, type RunEstimate } from "../model/estimate";
import { repoSize, sizeFacts, type RepoSize } from "../model/repoSize";
import type { SkillName } from "./agents";

/** How long a folder's size is reused. */
export const SIZE_TTL_MS = 60_000;
/** `sustain.confirmAboveTokens` when unset. */
export const DEFAULT_CONFIRM_ABOVE = 300_000;

const sizes = new Map<string, { at: number; size: RepoSize }>();

/** The size of `root`, measured at most once a minute. */
export function folderSize(root: string, now = Date.now()): RepoSize {
  const cached = sizes.get(root);
  if (cached !== undefined && now - cached.at < SIZE_TTL_MS) return cached.size;
  const size = repoSize(root);
  sizes.set(root, { at: now, size });
  return size;
}

/** Forgets every measured size, for the tests. */
export function forgetSizes(): void {
  sizes.clear();
}

/** Tokens above which a run needs a second click. */
export function confirmAbove(): number {
  const value = vscode.workspace.getConfiguration("sustain").get<number>("confirmAboveTokens", DEFAULT_CONFIRM_ABOVE);
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : DEFAULT_CONFIRM_ABOVE;
}

/** The estimate kind a skill's run spends. */
export function estimateKind(skill: SkillName): EstimateKind {
  return skill === "sustain-refresh" ? "refresh" : "full";
}

/** The estimate of a `kind` run by `agent` in `root`, or `null` when the folder cannot be measured. */
export function launchEstimate(root: string, agent: EstimateAgent, kind: EstimateKind): RunEstimate | null {
  try {
    return runEstimate(sizeFacts(folderSize(root)), agent, kind, confirmAbove());
  } catch {
    return null;
  }
}
