// PRC-04: the Sustain check on a pull request. It runs PRC-01 from origin/<base> to HEAD, posts or
// updates one comment marked <!-- sustain-check --> and sets the job result from fail-on. Only with
// `upload` does it send the check and its map to Sustain Cloud (CLD-09), and only with `refresh` does
// it run an agent to update the map (PRC-05).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { actionsOidcToken, postUpload } from "../../src/cloud/client";
import { runCheck } from "../../src/model/check";
import { FAIL_ON, type FailOn } from "../../src/model/config";
import { COMMENT_MARKER, deltaMarkdown, deltaMermaid } from "../../src/model/deltaMarkdown";
import { collectGitFacts } from "../../src/model/git";
import { checkPayload, checkUpload } from "../../src/model/upload";
import type { GitHubClient } from "./github";
import { refreshDecision, refreshLines, runRefresh } from "./refresh";

/** Items per list in the comment; GitHub caps a comment at 65,536 characters. */
export const COMMENT_ITEMS = 30;

export interface ActionContext {
  /** The workflow's environment: `INPUT_*`, `GITHUB_*`. */
  env: NodeJS.ProcessEnv;
  /** The checked-out repository. */
  root: string;
  /** The `pull_request` event payload. */
  event: unknown;
  client: GitHubClient;
  log: (line: string) => void;
  /** The network for the cloud upload; the tests replace it. */
  fetcher?: typeof fetch;
}

export interface ActionResult {
  exitCode: 0 | 1;
  result: "pass" | "fail" | "error";
  /** The comment's body, when one was written. */
  comment: string | null;
}

function input(env: NodeJS.ProcessEnv, name: string): string {
  return (env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}

function pullRequest(event: unknown): { number: number; baseRef: string; headRef: string; defaultBranch: string | undefined } | null {
  const typed = event as { pull_request?: { number?: unknown; base?: { ref?: unknown }; head?: { ref?: unknown } }; repository?: { default_branch?: unknown } } | null;
  const pull = typed?.pull_request;
  if (typeof pull?.number !== "number" || typeof pull.base?.ref !== "string") return null;
  const defaultBranch = typed?.repository?.default_branch;
  return { number: pull.number, baseRef: pull.base.ref, headRef: typeof pull.head?.ref === "string" ? pull.head.ref : pull.base.ref, defaultBranch: typeof defaultBranch === "string" ? defaultBranch : undefined };
}

/**
 * CLD-09: uploads the check and the map it compared with, signed by the job's OIDC token, and
 * returns the pull request page's address, or why it did not upload.
 */
async function uploadCheck(context: ActionContext, pull: NonNullable<ReturnType<typeof pullRequest>>, report: unknown, run: string): Promise<{ ok: true; page: string } | { ok: false; reason: string }> {
  const cloud = input(context.env, "cloud-url") || context.env["SUSTAIN_CLOUD_URL"] || "";
  const repo = context.env["GITHUB_REPOSITORY"] ?? "";
  if (cloud === "") return { ok: false, reason: "upload needs the cloud-url input." };
  const head = collectGitFacts(context.root)?.head;
  if (head === undefined) return { ok: false, reason: "upload needs the checked-out commit." };
  const map: unknown = JSON.parse(readFileSync(join(context.root, ".archify", run, "candidate.json"), "utf8"));
  const payload = checkPayload({ repo, commit: head, branch: pull.headRef, pull: pull.number, check: report, map, run, ...(pull.defaultBranch ? { defaultBranch: pull.defaultBranch } : {}) });
  const issues = checkUpload(payload);
  if (issues.length > 0) return { ok: false, reason: `the upload would be refused: ${issues.map((issue) => `${issue.pointer} ${issue.message}`).join("; ")}` };
  const token = await actionsOidcToken(context.env, context.fetcher);
  const result = await postUpload(cloud, token, payload, context.fetcher);
  if (!result.ok) return { ok: false, reason: result.message };
  return { ok: true, page: `${cloud.replace(/\/+$/, "")}/${repo}/pull/${pull.number}` };
}

export async function runAction(context: ActionContext): Promise<ActionResult> {
  const pull = pullRequest(context.event);
  if (pull === null) {
    context.log("Sustain check runs on pull_request events; this event has no pull request.");
    return { exitCode: 1, result: "error", comment: null };
  }
  const failOn = input(context.env, "fail-on").split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (!failOn.every((entry) => (FAIL_ON as readonly string[]).includes(entry))) {
    context.log(`fail-on takes ${FAIL_ON.join(", ")}.`);
    return { exitCode: 1, result: "error", comment: null };
  }
  const map = input(context.env, "map");
  const outcome = runCheck({ root: context.root, base: `origin/${pull.baseRef}`, head: "HEAD", ...(map === "" ? {} : { map }), failOn: failOn as FailOn[] });
  if (!outcome.ok) {
    context.log(outcome.reason);
    return { exitCode: 1, result: "error", comment: null };
  }
  const { report, diagram } = outcome;
  let page: string | null = null;
  if (input(context.env, "upload") === "true") {
    const uploaded = await uploadCheck(context, pull, report, report.map).catch((error: unknown) => ({ ok: false as const, reason: error instanceof Error ? error.message : String(error) }));
    if (uploaded.ok) page = uploaded.page;
    else context.log(`Not uploaded: ${uploaded.reason}`);
  }
  let update: string[] = [];
  const decision = refreshDecision({ refresh: input(context.env, "refresh"), env: context.env, event: context.event, report, components: diagram.components, head: collectGitFacts(context.root)?.head ?? null });
  if (decision.run) {
    const outcome = runRefresh({ root: context.root, map: report.map, agent: decision.agent, paths: decision.paths, headRef: pull.headRef, skillSource: join(__dirname, "..", "..", "skills", "sustain-refresh"), env: context.env });
    update = refreshLines(outcome);
    context.log(outcome.ok ? `Map updated in ${outcome.run}.` : `Map not updated: ${outcome.reason}`);
  } else if (decision.reason !== null) {
    update = refreshLines({ ok: false, reason: decision.reason });
    context.log(`Map not updated: ${decision.reason}`);
  }
  const chart = deltaMermaid(report, diagram);
  const link = page === null ? [] : ["", `[See it on the map in Sustain Cloud](${page})`];
  const body = [COMMENT_MARKER, deltaMarkdown(report, report, COMMENT_ITEMS).trimEnd(), ...update, ...link, ...(chart === null ? [] : ["", chart])].join("\n");

  if (input(context.env, "comment") !== "false") {
    const existing = (await context.client.listComments(pull.number)).find((comment) => comment.body.startsWith(COMMENT_MARKER));
    if (existing) await context.client.updateComment(existing.id, body);
    else await context.client.createComment(pull.number, body);
  }
  context.log(`Sustain check: ${report.result}${report.reasons.length > 0 ? ` (${report.reasons.join("; ")})` : ""}`);
  return { exitCode: report.result === "pass" ? 0 : 1, result: report.result, comment: body };
}
