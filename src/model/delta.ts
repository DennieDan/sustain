// PRC-01: what a change does to the map, at zero tokens. Boxes the diff touches, boxes whose code
// changed or went, changed source files no box owns, and directories that may deserve a box of
// their own. PRC-06 adds arrows the diff's new imports call for, and directories whose new files
// import each other more than any box. Browser-safe; check.ts gathers the inputs from git.
import { markChanges, type FileChange } from "./changes";
import type { FailOn } from "./config";
import { dirOf, Ownership } from "./ownership";
import type { Violation } from "./rules";
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

/** PRC-06: an arrow the map lacks, for import links the diff added between two boxes. */
export interface NewArrow {
  from: BoxRef;
  to: BoxRef;
  /** The added import links, file to file. */
  links: { from: string; to: string }[];
}

export interface DeltaReport {
  touched: { strong: BoxRef[]; weak: BoxRef[] };
  stale: (BoxRef & { state: Freshness })[];
  uncovered: string[];
  candidates: Candidate[];
  gone: BoxRef[];
  arrows: NewArrow[];
  /** ARC-01: imports the diff added that break the architecture rules. */
  violations: Violation[];
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
  /** The map's arrows. */
  connections?: readonly { from: string; to: string }[];
  /** The repository files each changed file imports, at the merge base and at the head (PRC-06). */
  imports?: { base: ReadonlyMap<string, readonly string[]>; head: ReadonlyMap<string, readonly string[]> };
  /** Rule violations the diff added (ARC-01), found by the caller. */
  violations?: readonly Violation[];
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
    // PRC-06: files that import each other more than they import any one box's files.
    const inGroup = new Set(members.map((change) => change.path));
    let internal = 0;
    const toBoxes = new Map<string, number>();
    for (const member of members) {
      for (const target of inputs.imports?.head.get(member.path) ?? []) {
        if (inGroup.has(target)) internal++;
        else for (const owner of ownership.owners(target)) toBoxes.set(owner, (toBoxes.get(owner) ?? 0) + 1);
      }
    }
    const cohesive = internal > 0 && internal > Math.max(0, ...toBoxes.values());
    if (dir !== "" && (fresh || grown || cohesive)) {
      candidates.push({
        dir,
        files: members.map((change) => ({ path: change.path, added: change.added ?? 0 })).sort((a, b) => a.path.localeCompare(b.path)),
        lines,
        label: dir.slice(dir.lastIndexOf("/") + 1),
      });
    }
  }

  const connected = (a: string, b: string): boolean => (inputs.connections ?? []).some((arrow) => (arrow.from === a && arrow.to === b) || (arrow.from === b && arrow.to === a));
  const arrows = new Map<string, NewArrow>();
  for (const [file, targets] of inputs.imports?.head ?? new Map<string, readonly string[]>()) {
    const before = new Set(inputs.imports?.base.get(file) ?? []);
    for (const target of targets) {
      if (before.has(target)) continue;
      for (const from of ownership.owners(file)) {
        for (const to of ownership.owners(target)) {
          if (from === to || connected(from, to)) continue;
          const key = `${from}\0${to}`;
          const arrow = arrows.get(key) ?? { from: ref(from), to: ref(to), links: [] };
          arrow.links.push({ from: file, to: target });
          arrows.set(key, arrow);
        }
      }
    }
  }

  return {
    touched: { strong: marks.strong.map(ref), weak: marks.weak.map(ref) },
    stale,
    uncovered: uncoveredChanges.map((change) => change.path).sort(),
    candidates: candidates.sort((a, b) => a.dir.localeCompare(b.dir)),
    gone: gone.map(ref),
    arrows: [...arrows.values()].sort((a, b) => a.from.id.localeCompare(b.from.id) || a.to.id.localeCompare(b.to.id)),
    violations: [...(inputs.violations ?? [])],
  };
}

/** Pass or fail under `failOn`, with the reasons for a failure. */
export function verdict(report: DeltaReport, failOn: readonly FailOn[]): { result: "pass" | "fail"; reasons: string[] } {
  const reasons: string[] = [];
  if (failOn.includes("stale") && report.stale.length + report.gone.length > 0) reasons.push(`${report.stale.length + report.gone.length} stale or gone box(es)`);
  if (failOn.includes("new-box") && report.candidates.length > 0) reasons.push(`${report.candidates.length} new box candidate(s)`);
  if (failOn.includes("new-arrow") && report.arrows.length > 0) reasons.push(`${report.arrows.length} new arrow candidate(s)`);
  if (failOn.includes("violation") && report.violations.length > 0) reasons.push(`${report.violations.length} rule violation(s)`);
  return { result: reasons.length === 0 ? "pass" : "fail", reasons };
}
