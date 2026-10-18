// `node .agents/skills/sustain-architecture/scripts/validate.mjs <repo>/.archify/<run>/draft.json`
// (FR-VAL-01..06). Contract and exit codes: ADR 0017. Bundled to a dependency-free ESM file.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkCitations } from "../model/citations";
import { assertWritable } from "../model/confine";
import { checkEvidence, EVIDENCE_FILE, type EvidenceFinding } from "../model/evidence";
import { fingerprint, writeFingerprints } from "../model/fingerprints";
import { collectGitFacts, repositoryFromGit } from "../model/git";
import { ARCHIFY_DIR, CANDIDATE_FILE, locateDraft, publishCandidate, type DraftLocation } from "../model/runFolder";
import { newRunRecord, readRunRecord, RUN_FILE, updateRunRecord, type RunRecord } from "../model/runRecord";
import { writeJson } from "../model/session";
import { checkSubmission, REMOVED_FIELD_MESSAGE } from "../model/submission";
import { fileReader } from "../model/staleness";
import { stringifyDocument, type ArchifyDoc, type Issue } from "../model/types";

const MAX_LISTED_ERRORS = 50;
const HINT = "Fix exactly these errors and run the validator again.";

interface Report {
  status: "accepted" | "rejected";
  candidate?: string;
  errors: { pointer: string; message: string }[];
  warnings: { pointer: string; message: string }[];
  /** ACC-01: what to review once after acceptance; only on an accepted report. */
  evidence?: EvidenceFinding[];
  hint?: string;
}

function listErrors(errors: Issue[]): Report["errors"] {
  const listed = errors.slice(0, MAX_LISTED_ERRORS).map(({ code, pointer, message }) => ({ pointer, message: `${code}: ${message}` }));
  if (errors.length > MAX_LISTED_ERRORS) {
    listed.push({ pointer: "", message: `${errors.length - MAX_LISTED_ERRORS} more errors not shown` });
  }
  return listed;
}

/** The skill version, filled in by the build. */
const SKILL_VERSION = process.env.SUSTAIN_VERSION ?? "unknown";

/** Merges `patch` into the run's run.json, creating it for runs that predate run records (CST-04). */
function record(location: DraftLocation, patch: Partial<RunRecord>): void {
  updateRunRecord(location.root, dirname(location.draft), patch, () => newRunRecord({ focus: "", skillVersion: SKILL_VERSION }));
}

function usageError(message: string): number {
  process.stderr.write(`validate.mjs: ${message}\n`);
  return 2;
}

function main(args: string[]): number {
  if (args.length !== 1) {
    return usageError(`usage: node validate.mjs <repo>/${ARCHIFY_DIR}/<run>/draft.json`);
  }
  let location: DraftLocation;
  let text: string;
  try {
    location = locateDraft(args[0]!, process.cwd());
    text = readFileSync(location.draft, "utf8");
  } catch (error) {
    return usageError((error as Error).message);
  }
  try {
    const attempts = (readRunRecord(dirname(location.draft))?.attempts ?? 0) + 1;
    record(location, { phase: "validating", attempts });
  } catch (error) {
    return usageError(`cannot write ${RUN_FILE}: ${(error as Error).message}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const report: Report = {
      status: "rejected",
      errors: listErrors([{ code: "Json", pointer: "", message: `draft.json is not valid JSON: ${(error as Error).message}` }]),
      warnings: [],
      hint: HINT,
    };
    record(location, { phase: "rejected" });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }

  const git = collectGitFacts(location.root);
  const { removed, errors } = checkSubmission(
    value,
    {
      output: `${ARCHIFY_DIR}/${location.run}/${location.slug}.html`,
      repository: git ? repositoryFromGit(git) : null,
    },
    (doc) => checkCitations(doc, location.root),
  );
  const warnings = removed.map((pointer) => ({ pointer, message: REMOVED_FIELD_MESSAGE }));

  if (errors.length > 0) {
    const report: Report = { status: "rejected", errors: listErrors(errors), warnings, hint: HINT };
    record(location, { phase: "rejected" });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }
  const doc = value as ArchifyDoc;
  const read = fileReader(location.root);
  const evidence = checkEvidence(doc.components, (path) => read(path)?.toString("utf8") ?? null);
  try {
    const runDir = dirname(location.draft);
    assertWritable(location.root, join(runDir, CANDIDATE_FILE));
    publishCandidate(location.draft, stringifyDocument(value));
    writeFingerprints(location.root, runDir, fingerprint(doc, location.root, git?.head ?? null));
    assertWritable(location.root, join(runDir, EVIDENCE_FILE));
    writeJson(join(runDir, EVIDENCE_FILE), evidence);
    record(location, { phase: "accepted", finishedAt: new Date().toISOString() });
  } catch (error) {
    return usageError(`cannot publish ${CANDIDATE_FILE}: ${(error as Error).message}`);
  }
  const report: Report = {
    status: "accepted",
    candidate: `${ARCHIFY_DIR}/${location.run}/${CANDIDATE_FILE}`,
    errors: [],
    warnings,
    evidence: evidence.findings,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
