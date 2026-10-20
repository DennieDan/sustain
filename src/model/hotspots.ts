// ARC-03: how much each box's code changes. Commits, lines changed and the number of distinct authors
// over the files a box owns (PRC-01's ownership), from git's log at zero tokens. Authors are only
// counted, never named. Browser-safe; git.ts reads the log.
import type { LoggedCommit } from "./git";
import { Ownership } from "./ownership";

export interface BoxHotspot {
  id: string;
  commits: number;
  lines: number;
  authors: number;
  /** 0 for no commits, then 1 to 4 by share of the busiest box's commits. */
  level: number;
}

/** Every box's hotspot figures from `log`, busiest first. */
export function hotspots(log: readonly LoggedCommit[], components: readonly { id: string; sources?: readonly { path: string }[] }[]): BoxHotspot[] {
  const ownership = new Ownership(components);
  const stats = new Map(components.map((component) => [component.id, { commits: new Set<string>(), lines: 0, authors: new Set<string>() }]));
  for (const entry of log) {
    for (const file of entry.files) {
      for (const owner of ownership.owners(file.path)) {
        const box = stats.get(owner);
        if (box === undefined) continue;
        box.commits.add(entry.commit);
        box.lines += file.added + file.deleted;
        box.authors.add(entry.author);
      }
    }
  }
  const busiest = Math.max(0, ...[...stats.values()].map((box) => box.commits.size));
  return [...stats]
    .map(([id, box]) => ({ id, commits: box.commits.size, lines: box.lines, authors: box.authors.size, level: box.commits.size === 0 ? 0 : Math.ceil((4 * box.commits.size) / busiest) }))
    .sort((a, b) => b.commits - a.commits || b.lines - a.lines || a.id.localeCompare(b.id));
}

/** The tooltip line for a box. */
export function hotspotNote(box: BoxHotspot, days: number): string {
  const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;
  return `${plural(box.commits, "commit")}, ${plural(box.lines, "line")} changed, ${plural(box.authors, "author")} in the last ${days} days.`;
}
