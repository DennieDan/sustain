// PRC-01: what a change does to the map, at zero tokens. Boxes the diff touches, boxes whose code
// changed or went, changed source files no box owns, and directories that may deserve a box of
// their own. Browser-safe; check.ts gathers the inputs from git.
import { markChanges, type FileChange } from "./changes";
import type { FailOn } from "./config";
import { dirOf, Ownership } from "./ownership";
import type { Freshness, MapFreshness } from "./staleness";

/** Lines a directory must gain to suggest a box. */
export const CANDIDATE_LINES = 200;
/** Source files a new directory must hold to suggest a box. */
export const CANDIDATE_FILES = 3;

const SOURCE_EXTENSIONS = new Set(
  "ts tsx js jsx mjs cjs py go rs java kt kts scala rb php cs fs c h cc cpp cxx hpp m mm swift dart lua sh sql vue svelte ex exs erl hs clj elm zig nim r jl".split(" "),
);

/** Whether `path` is source code, by its extension, outside `.archify/`. */
export function isSourceFile(path: string): boolean {
  if (path.startsWith(".archify/")) return false;
  const dot = path.lastIndexOf(".");
  return dot > path.lastIndexOf("/") && SOURCE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/** Whether `path` is a test file by the usual folder and name conventions. */
export function isTestFile(path: string): boolean {
  return /(^|\/)(test|tests|__tests__|spec|specs)\//.test(path) || /\.(test|spec)\.[^./]+$/.test(path) || /_test\.[^./]+$/.test(path) || /(^|\/)test_[^/]+$/.test(path);
}

export interface BoxRef {
  id: string;
  label: string;
}

export interface Candidate {
  /** The directory a new box would cover, `""` for the repository root. */
  dir: string;
  files: { path: string; added: number }[];
  /** Non-test lines added under it. */
  lines: number;
  /** The directory's name. */
  label: string;
}

export interface DeltaReport {
  touched: { strong: BoxRef[]; weak: BoxRef[] };
  stale: (BoxRef & { state: Freshness })[];
  uncovered: string[];
  candidates: Candidate[];
  gone: BoxRef[];
}

export interface DeltaInputs {
  components: readonly { id: string; label: string; sources?: { path: string; line?: number; end_line?: number }[] }[];
  /** The diff from the base to the head, with untracked files as added ones. */
  changes: readonly FileChange[];
  /** The map against the code at the head. */
  freshness: MapFreshness;
  /** Paths to leave out of the uncovered changes and candidates. */
  ignore: readonly RegExp[];
  /** Whether `dir` existed at the base. */
  existedAtBase: (dir: string) => boolean;
  /** Source files under `dir` at the head. */
  sourceFilesIn: (dir: string) => number;
}

/** The deepest directory holding all of `paths`. */
function commonDir(paths: readonly string[]): string {
  let dir = dirOf(paths[0]!);
  for (const path of paths) while (dir !== "" && path !== dir && !path.startsWith(`${dir}/`)) dir = dirOf(dir);
  return dir;
}

export function deltaReport(inputs: DeltaInputs): DeltaReport {
  const label = new Map(inputs.components.map((component) => [component.id, component.label]));
  const ref = (id: string): BoxRef => ({ id, label: label.get(id) ?? id });
  const marks = markChanges(
    inputs.components.map((component) => ({ id: component.id, sources: component.sources ?? [] })),
    inputs.changes,
  );

  const byBox = new Map<string, Freshness[]>();
  for (const citation of inputs.freshness.citations) byBox.set(citation.component, [...(byBox.get(citation.component) ?? []), citation.state]);
  const gone = [...byBox].filter(([, states]) => states.every((state) => state === "missing")).map(([id]) => id);
  const stale = Object.entries(inputs.freshness.boxes)
    .filter(([id, state]) => (state === "edited" || state === "missing") && !gone.includes(id))
    .map(([id, state]) => ({ ...ref(id), state }));

  const ownership = new Ownership(inputs.components);
  const ignored = (path: string): boolean => inputs.ignore.some((glob) => glob.test(path));
  const uncoveredChanges = inputs.changes.filter(
    (change) => change.status !== "deleted" && isSourceFile(change.path) && !ignored(change.path) && ownership.owners(change.path).length === 0,
  );

  // Each uncovered file joins the highest directory above it with nothing cited below.
  const groups = new Map<string, FileChange[]>();
  for (const change of uncoveredChanges) {
    let key = dirOf(change.path);
    while (key !== "" && !ownership.ownsBelow(dirOf(key)) && dirOf(key) !== "") key = dirOf(key);
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  const candidates: Candidate[] = [];
  for (const members of groups.values()) {
    const dir = commonDir(members.map((change) => change.path));
    const lines = members.filter((change) => !isTestFile(change.path)).reduce((sum, change) => sum + (change.added ?? 0), 0);
    const fresh = !inputs.existedAtBase(dir) && (inputs.sourceFilesIn(dir) >= CANDIDATE_FILES || lines >= CANDIDATE_LINES);
    const grown = !ownership.ownsBelow(dir) && lines >= CANDIDATE_LINES;
    if (dir !== "" && (fresh || grown)) {
      candidates.push({
        dir,
        files: members.map((change) => ({ path: change.path, added: change.added ?? 0 })).sort((a, b) => a.path.localeCompare(b.path)),
        lines,
        label: dir.slice(dir.lastIndexOf("/") + 1),
      });
    }
  }

  return {
    touched: { strong: marks.strong.map(ref), weak: marks.weak.map(ref) },
    stale,
    uncovered: uncoveredChanges.map((change) => change.path).sort(),
    candidates: candidates.sort((a, b) => a.dir.localeCompare(b.dir)),
    gone: gone.map(ref),
  };
}

/** Pass or fail under `failOn`, with the reasons for a failure. */
export function verdict(report: DeltaReport, failOn: readonly FailOn[]): { result: "pass" | "fail"; reasons: string[] } {
  const reasons: string[] = [];
  if (failOn.includes("stale") && report.stale.length + report.gone.length > 0) reasons.push(`${report.stale.length + report.gone.length} stale or gone box(es)`);
  if (failOn.includes("new-box") && report.candidates.length > 0) reasons.push(`${report.candidates.length} new box candidate(s)`);
  return { result: reasons.length === 0 ? "pass" : "fail", reasons };
}
