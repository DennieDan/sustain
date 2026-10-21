// FRS-05: what a refresh needs to know about a map and the code since it was made. Browser-safe;
// refresh-facts.mjs gathers the inputs from disk and git.
import type { ChangeStat } from "./git";
import type { CitationState, MapFreshness } from "./staleness";

/** A `--paths` glob as a regular expression: `**` crosses folders, `*` and `?` stay inside one. */
export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      pattern += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // A plain folder name also matches everything below it.
  return new RegExp(`^${pattern}(?:/.*)?$`);
}

/** Whether `path` falls in the refresh's scope; every path does without globs. */
export function inScope(path: string, globs: readonly RegExp[]): boolean {
  return globs.length === 0 || globs.some((glob) => glob.test(path));
}

export interface RefreshInputs {
  freshness: MapFreshness;
  /** Every path the base map cites. */
  cited: ReadonlySet<string>;
  /** Changed files since the map's revision, `null` without git. */
  changes: ChangeStat[] | null;
  untracked: string[];
  /** Top-level folders now and at the map's revision (`null` when unknown). */
  foldersNow: string[];
  foldersThen: ReadonlySet<string> | null;
  globs: readonly RegExp[];
}

export interface RefreshReport {
  /** Citations that are not fresh, in scope. */
  stale: CitationState[];
  /** Boxes to re-examine: edited or missing ones, in scope. */
  boxes: string[];
  changes: (ChangeStat & { covered: boolean })[];
  /** Changed files no box cites. */
  uncovered: string[];
  newFolders: string[];
}

export function refreshReport(inputs: RefreshInputs): RefreshReport {
  const stale = inputs.freshness.citations.filter((citation) => citation.state !== "fresh" && inScope(citation.path, inputs.globs));
  const boxes = [...new Set(stale.filter((citation) => citation.state === "edited" || citation.state === "missing").map((citation) => citation.component))];
  const all: ChangeStat[] = [...(inputs.changes ?? []), ...inputs.untracked.map((path) => ({ path, added: null, deleted: null }))];
  const changes = all.filter((change) => inScope(change.path, inputs.globs)).map((change) => ({ ...change, covered: inputs.cited.has(change.path) }));
  const newFolders = inputs.foldersThen === null ? [] : inputs.foldersNow.filter((folder) => !inputs.foldersThen!.has(folder) && inScope(folder, inputs.globs));
  return { stale, boxes, changes, uncovered: changes.filter((change) => !change.covered).map((change) => change.path), newFolders };
}

/**
 * The refresh skill's arguments: `--from <run>`, then `--paths` and the files when given. A path
 * with a space is quoted; one with a quote, `$`, a backtick or a backslash is left out, since the
 * agent passes these on to a shell command.
 */
export function refreshArgs(run: string, paths: readonly string[] = []): string {
  const tokens = paths.flatMap((path) => {
    if (/^[\w./@+-]+$/.test(path)) return [path];
    return /["$`\\]/.test(path) ? [] : [`"${path}"`];
  });
  return tokens.length === 0 ? `--from ${run}` : `--from ${run} --paths ${tokens.join(" ")}`;
}
