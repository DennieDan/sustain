// `node <skill>/scripts/audit-record.mjs <repo>/.archify/<run>/audit-draft.json`, run with cwd = repo
// root (ACC-05): checks the audit skill's draft against the map and the code, writes audit.json beside
// the map, and removes the draft. Prints one JSON object: recorded, or rejected with the errors.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { AUDIT_DRAFT_FILE, AUDIT_FILE, checkAuditDraft, type AuditDraft } from "../model/audit";
import { checkCitations } from "../model/citations";
import { assertWritable } from "../model/confine";
import { ARCHIFY_DIR, CANDIDATE_FILE, parseRunFolderName } from "../model/runFolder";
import type { ArchifyDoc, Issue } from "../model/types";

const HINT = "Fix each error in audit-draft.json and run audit-record.mjs again.";

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(args: string[]): number {
  if (args.length !== 1) {
    process.stderr.write(`audit-record.mjs: usage: node audit-record.mjs <repo>/${ARCHIFY_DIR}/<run>/${AUDIT_DRAFT_FILE}\n`);
    return 2;
  }
  const draftPath = resolve(process.cwd(), args[0]!);
  const runDir = dirname(draftPath);
  const archify = dirname(runDir);
  if (basename(draftPath) !== AUDIT_DRAFT_FILE || basename(archify) !== ARCHIFY_DIR || !parseRunFolderName(basename(runDir))) {
    process.stderr.write(`audit-record.mjs: expected a path of the form <repo>/${ARCHIFY_DIR}/<run>/${AUDIT_DRAFT_FILE}, got ${args[0]}\n`);
    return 2;
  }
  const root = dirname(archify);
  let map: ArchifyDoc;
  try {
    map = JSON.parse(readFileSync(join(runDir, CANDIDATE_FILE), "utf8")) as ArchifyDoc;
  } catch (error) {
    process.stderr.write(`audit-record.mjs: the run has no readable ${CANDIDATE_FILE}: ${(error as Error).message}\n`);
    return 2;
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(draftPath, "utf8"));
  } catch (error) {
    print({ status: "rejected", errors: [{ pointer: "", message: `${AUDIT_DRAFT_FILE} is not valid JSON: ${(error as Error).message}` }], hint: HINT });
    return 1;
  }
  const connections = (map.connections ?? []).map((connection) => ({ from: connection.from, to: connection.to }));
  let issues: Issue[] = checkAuditDraft(value, { components: map.components, connections });
  if (issues.length === 0) {
    // The evidence passes the same path, deny-list and line checks as a map citation.
    const draft = value as AuditDraft;
    const asCitations = { ...map, components: draft.arrows.map((arrow, index) => ({ id: `arrow-${index}`, type: "external", label: "", sources: arrow.evidence })) } as unknown as ArchifyDoc;
    issues = checkCitations(asCitations, root).map((issue) => ({ ...issue, pointer: issue.pointer.replace(/^\/components\/(\d+)\/sources\//, "/arrows/$1/evidence/") }));
  }
  if (issues.length > 0) {
    print({ status: "rejected", errors: issues.map(({ pointer, message }) => ({ pointer, message })), hint: HINT });
    return 1;
  }
  const draft = value as AuditDraft;
  const target = join(runDir, AUDIT_FILE);
  try {
    assertWritable(root, target);
    writeFileSync(target, `${JSON.stringify({ schema: 1, createdAt: new Date().toISOString(), boxes: draft.boxes, arrows: draft.arrows }, null, 2)}\n`);
    rmSync(draftPath, { force: true });
  } catch (error) {
    process.stderr.write(`audit-record.mjs: cannot write ${AUDIT_FILE}: ${(error as Error).message}\n`);
    return 2;
  }
  const count = (verdict: string): number => draft.boxes.filter((box) => box.verdict === verdict).length;
  print({
    status: "recorded",
    audit: `${ARCHIFY_DIR}/${basename(runDir)}/${AUDIT_FILE}`,
    boxes: { supports: count("supports"), partial: count("partial"), contradicts: count("contradicts") },
    arrowsWithoutEvidence: draft.arrows.filter((arrow) => arrow.evidence.length === 0).length,
  });
  return 0;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
