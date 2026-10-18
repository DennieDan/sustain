// CLD-03 and CLD-04: what the viewer gets on a cloud page. Boxes open GitHub at the map's commit;
// freshness comes from the latest check, and a pull request page adds its overlay and candidates.
import type { CheckReport } from "../../../src/model/check";
import { freshnessHeader } from "../../../src/model/home";
import type { HostMessage } from "../../../src/model/messages";
import type { PageData } from "../../../src/model/page";
import type { Repository, UploadRow } from "./store";

interface MapPayload {
  map?: { meta?: { title?: string }; components?: unknown[] };
  check?: CheckReport;
}

function payload(row: UploadRow): MapPayload {
  return row.payload as MapPayload;
}

/** The map of an upload, or `null` when it carries none. */
export function mapOf(row: UploadRow | undefined): MapPayload["map"] | null {
  return row === undefined ? null : (payload(row).map ?? null);
}

export function checkOf(row: UploadRow | undefined): CheckReport | null {
  return row === undefined ? null : (payload(row).check ?? null);
}

export function mapPageData(repo: Repository, map: UploadRow, check: UploadRow | undefined, pull?: number): PageData {
  const doc = mapOf(map) ?? {};
  const report = checkOf(check);
  const messages: HostMessage[] = [];
  if (report) {
    const boxes = Object.fromEntries([...report.stale.map((box) => [box.id, box.state] as const), ...report.gone.map((box) => [box.id, "missing"] as const)]);
    const total = Array.isArray(doc.components) ? doc.components.length : 0;
    messages.push({ type: "freshness", boxes, header: freshnessHeader(Object.keys(boxes).length, total, check!.commit, check!.createdAt.toISOString(), new Date()) });
    if (pull !== undefined) {
      messages.push({ type: "changes", overlay: { scope: `Pull request #${pull}`, strong: report.touched.strong.map((box) => box.id), weak: report.touched.weak.map((box) => box.id), uncovered: report.uncovered } });
      messages.push({ type: "ghosts", ghosts: report.candidates.map((candidate) => ({ label: candidate.label, files: candidate.files.length })) });
    }
  }
  return {
    title: doc.meta?.title ?? `${repo.owner}/${repo.name}`,
    doc,
    root: null,
    project: null,
    repository: { url: `https://github.com/${repo.owner}/${repo.name}`, revision: map.commit, provider: "github" },
    messages,
  };
}
