// UI-01: the sidebar's maps list, from each candidate and its run record.
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { listCandidates } from "./discovery";
import type { MapItem } from "./messages";
import { readRunRecord } from "./runRecord";
import { parseDiagram } from "./tolerant";

/** Every candidate in `root`, newest first, described for the maps list. */
export function listMaps(root: string): MapItem[] {
  return listCandidates(root).map((candidate) => {
    const record = readRunRecord(dirname(candidate.file));
    let title: string | null = null;
    let boxes: number | null = null;
    try {
      const result = parseDiagram(readFileSync(candidate.file, "utf8"));
      if (result.ok) {
        title = result.diagram.title ?? null;
        boxes = result.diagram.components.length;
      }
    } catch {
      // Unreadable: listed by folder name only.
    }
    return {
      runFolder: candidate.runFolder,
      file: candidate.file,
      title,
      focus: record?.focus ?? "",
      agent: record?.agent ?? null,
      createdAt: record?.createdAt ?? new Date(candidate.mtimeMs).toISOString(),
      boxes,
      changed: null,
    };
  });
}
