// PRC-04: the Sustain check on a pull request. It runs PRC-01 from origin/<base> to HEAD, posts or
// updates one comment marked <!-- sustain-check --> and sets the job result from fail-on.
import { runCheck } from "../../src/model/check";
import { FAIL_ON, type FailOn } from "../../src/model/config";
import { COMMENT_MARKER, deltaMarkdown, deltaMermaid } from "../../src/model/deltaMarkdown";
import type { GitHubClient } from "./github";

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
  const chart = deltaMermaid(report, diagram);
  const body = [COMMENT_MARKER, deltaMarkdown(report, report, COMMENT_ITEMS).trimEnd(), ...(chart === null ? [] : ["", chart])].join("\n");

  if (input(context.env, "comment") !== "false") {
    const existing = (await context.client.listComments(pull.number)).find((comment) => comment.body.startsWith(COMMENT_MARKER));
    if (existing) await context.client.updateComment(existing.id, body);
    else await context.client.createComment(pull.number, body);
  }
  context.log(`Sustain check: ${report.result}${report.reasons.length > 0 ? ` (${report.reasons.join("; ")})` : ""}`);
  return { exitCode: report.result === "pass" ? 0 : 1, result: report.result, comment: body };
}
