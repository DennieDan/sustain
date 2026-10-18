// The mutation engine that seeds bug-hunt bugs (ADR 0031): the agent chooses file, line
// and kind; the engine rewrites the first matching operator or keyword on that line —
// never inside a string or comment — and hands back the exact pristine and buggy hunks so
// the manifest can never disagree with the code. Pure functions over file text, plus a
// thin read/write wrapper. Mutations are line-local, with no regex-literal or template-`${}`
// awareness (ADR 0038). Java has its own tables, and its generic type arguments are never
// mutated (spec v0.3 LRN-02).
import { readFileSync, writeFileSync } from "node:fs";
import { languageOf, type BugRegion, type MutationKind, type SourceLanguage } from "../../../model/session";

export interface MutationResult {
  /** The mutated line as a 1-based inclusive range (single-line hunks in v1). */
  region: BugRegion;
  /** The line before mutation. */
  pristineHunk: string;
  /** The mutated line; its absence is what `verify` checks for. */
  buggyHunk: string;
  /** Full file text after the mutation. */
  text: string;
}

/**
 * Per-line mask: `true` where a character is code, `false` inside `'…'`/`"…"`/`` `…` ``
 * strings, `//` line comments and `/* … *\/` block comments. Escaped characters keep their
 * quote's mask. Template-literal `${…}` contents count as string in v1 — conservative:
 * the engine simply will not mutate inside a template.
 */
function codeMask(line: string): boolean[] {
  const mask = new Array<boolean>(line.length).fill(true);
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quote !== null) {
      mask[i] = false;
      if (ch === "\\") {
        i += 1;
        if (i < line.length) mask[i] = false;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    const next = line[i + 1];
    if (ch === "/" && next === "/") {
      for (let j = i; j < line.length; j += 1) mask[j] = false;
      break;
    }
    if (ch === "/" && next === "*") {
      let j = i;
      while (j < line.length && !(line[j] === "*" && line[j + 1] === "/")) {
        mask[j] = false;
        j += 1;
      }
      if (j + 1 < line.length) {
        mask[j] = false;
        mask[j + 1] = false;
        j += 2;
      }
      i = j - 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      mask[i] = false;
      quote = ch;
    }
  }
  return mask;
}

/**
 * LRN-02: marks Java generic type arguments as not code, such as `List<Person>`, `Map<K, List<V>>`,
 * `new HashMap<>()` and `<T extends Comparable<T>>`. A span counts as type arguments when it starts
 * with an upper-case letter, `?` or `>`, and holds only names, spaces, `,`, `.`, `?`, `[]`, a single
 * `&` and nested angle brackets. A comparison that looks like one is left alone too, which costs a
 * target and never plants a different bug.
 */
function maskGenerics(line: string, mask: boolean[]): void {
  for (let start = 0; start < line.length; start += 1) {
    if (line[start] !== "<" || !mask[start]) continue;
    const first = /\S/.exec(line.slice(start + 1));
    if (first === null || !/[A-Z?>]/.test(first[0])) continue;
    let depth = 0;
    let end = -1;
    for (let at = start; at < line.length; at += 1) {
      const char = line[at]!;
      if (char === "<") depth += 1;
      else if (char === ">") depth -= 1;
      else if (!/[\w\s,.?[\]&]/.test(char) || (char === "&" && line[at + 1] === "&")) break;
      if (depth === 0) {
        end = at;
        break;
      }
    }
    if (end === -1) continue;
    for (let at = start; at <= end; at += 1) mask[at] = false;
    start = end;
  }
}

interface Rule {
  find: RegExp;
  /** The replacement for the whole match. */
  to: string | ((match: RegExpExecArray) => string);
}

/** A receiver such as `name`, `this.name` or `person.getName()`; never `super`, never after `.`, `)` or `]`. */
const RECEIVER = String.raw`(?<![\w$.)\]])(!?)((?!super\b)[A-Za-z_$][\w$]*(?:\([^()]*\))?(?:\.[A-Za-z_$][\w$]*(?:\([^()]*\))?)*)`;

/**
 * Ordered rewrite tables per kind (ADR 0038): the first rule with a code-region match on
 * the line wins, so a line with several candidates mutates deterministically. Off-by-one
 * shifts the bound (`<`→`<=`); flipped-comparison reverses the test (`===`→`!==`,
 * `<`→`>`); missing-await drops the keyword. Lookarounds keep `=>`, `<<`, `===` and `!==`
 * from being split mid-token.
 */
const OFF_BY_ONE: Rule[] = [
  { find: /(?<![<>=!])<(?![<=])/g, to: "<=" },
  { find: /(?<![<>=!])<=/g, to: "<" },
  { find: /(?<![-=<>])>(?![=>])/g, to: ">=" },
  { find: /(?<![<>=!])>=/g, to: ">" },
];

const FLIPPED_COMPARISON: Rule[] = [
  { find: /===/g, to: "!==" },
  { find: /!==/g, to: "===" },
  { find: /(?<![<>=!])<=/g, to: ">=" },
  { find: /(?<![<>=!])>=/g, to: "<=" },
  { find: /(?<![<>=!])<(?![<=])/g, to: ">" },
  { find: /(?<![-=<>])>(?![=>])/g, to: "<" },
  { find: /(?<![=!])==(?![=])/g, to: "!=" },
  { find: /!=(?![=])/g, to: "==" },
];

/** The kinds each language offers, as ordered rewrite tables (ADR 0038, LRN-02). */
const RULES: Record<SourceLanguage, Partial<Record<MutationKind, Rule[]>>> = {
  js: {
    "off-by-one": OFF_BY_ONE,
    "flipped-comparison": FLIPPED_COMPARISON,
    "missing-await": [{ find: /(?<![.\w$])await\b\s*/g, to: "" }],
  },
  java: {
    "off-by-one": OFF_BY_ONE,
    "flipped-comparison": FLIPPED_COMPARISON,
    "and-or-swap": [
      { find: /&&/g, to: "||" },
      { find: /\|\|/g, to: "&&" },
    ],
    // `a.equals(b)` becomes `a == b`, and `!a.equals(b)` becomes `a != b`. An argument with a comma
    // at the top, such as `Objects.equals(a, b)`, or with nested calls deeper than one level, is left alone.
    "reference-equality": [
      {
        find: new RegExp(`${RECEIVER}\\.equals\\(((?:[^(),]|\\([^()]*\\))+)\\)`, "g"),
        to: (match) => `${match[2]} ${match[1] === "!" ? "!=" : "=="} ${match[3]!.trim()}`,
      },
    ],
  },
};

const LANGUAGE_NAMES: Record<SourceLanguage, string> = { js: "JavaScript and TypeScript", java: "Java" };

/** The kinds `language` offers, in table order. */
export function kindsFor(language: SourceLanguage): MutationKind[] {
  return Object.keys(RULES[language]) as MutationKind[];
}

/** The first match of `rule` that lies entirely in code (not in a string or comment). */
function firstCodeMatch(line: string, mask: boolean[], rule: Rule): RegExpExecArray | null {
  for (const match of line.matchAll(rule.find)) {
    const start = match.index;
    const end = start + match[0]!.length;
    let inCode = true;
    for (let i = start; i < end; i += 1) {
      if (!mask[i]) {
        inCode = false;
        break;
      }
    }
    if (inCode) return match as RegExpExecArray;
  }
  return null;
}

/** The line with its first matching target mutated, or `null` when the line or the language has none. */
export function mutateLine(line: string, kind: MutationKind, language: SourceLanguage = "js"): string | null {
  const mask = codeMask(line);
  if (language === "java") maskGenerics(line, mask);
  for (const rule of RULES[language][kind] ?? []) {
    const hit = firstCodeMatch(line, mask, rule);
    if (hit !== null) return line.slice(0, hit.index) + (typeof rule.to === "string" ? rule.to : rule.to(hit)) + line.slice(hit.index + hit[0].length);
  }
  return null;
}

/**
 * Mutates `line` (1-based) of `text` for `kind` in `language`. Throws `… does not apply to …`,
 * `line … is outside the file` or `line … has no "<kind>" target`, which the caller turns into
 * command failures.
 */
export function mutateText(text: string, line: number, kind: MutationKind, language: SourceLanguage = "js"): MutationResult {
  if (RULES[language][kind] === undefined) throw new Error(`"${kind}" does not apply to ${LANGUAGE_NAMES[language]}; its kinds are ${kindsFor(language).join(", ")}`);
  const lines = text.split("\n");
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    throw new Error(`line ${line} is outside the file (${lines.length} lines)`);
  }
  const pristineHunk = lines[line - 1]!;
  const buggyHunk = mutateLine(pristineHunk, kind, language);
  if (buggyHunk === null || buggyHunk === pristineHunk) throw new Error(`line ${line} has no "${kind}" target`);
  lines[line - 1] = buggyHunk;
  return { region: { startLine: line, endLine: line }, pristineHunk, buggyHunk, text: lines.join("\n") };
}

/** Reads `path`, applies {@link mutateText} in the file's language and writes the mutated text back. */
export function mutateFile(path: string, line: number, kind: MutationKind): MutationResult {
  const language = languageOf(path);
  if (language === null) throw new Error(`${path}: bugs are seeded in JavaScript, TypeScript and Java files only`);
  const result = mutateText(readFileSync(path, "utf8"), line, kind, language);
  writeFileSync(path, result.text);
  return result;
}

/** How many trimmed lines of `text` equal `hunk` (trimmed). */
export function hunkCount(text: string, hunk: string): number {
  const trimmed = hunk.trim();
  if (trimmed === "") return 0;
  return text.split("\n").filter((line) => line.trim() === trimmed).length;
}

/**
 * Whether a seeded bug still shows in `text`: more trimmed `buggyHunk` lines than the
 * `twins` that pre-existed at injection, so a pre-existing identical line cannot pass a
 * fix off as done (ADR 0038).
 */
export function bugStillPresent(text: string, bug: { buggyHunk: string; twins: number }): boolean {
  return hunkCount(text, bug.buggyHunk) > bug.twins;
}

/**
 * `restore`/`abandon` (ADR 0033): writes `pristineHunk` back over the still-seeded
 * `buggyHunk` — the trimmed-matching line nearest `region.startLine`, which is the seeded
 * instance even when identical twins pre-existed. Returns the new file text, or `null`
 * when the seeded hunk is already absent (the file is never touched: only the recorded
 * hunk is restored, never a user edit elsewhere and never a pre-existing twin).
 */
export function restoreHunk(text: string, bug: { buggyHunk: string; pristineHunk: string; region: BugRegion; twins: number }): string | null {
  if (!bugStillPresent(text, bug)) return null;
  const trimmed = bug.buggyHunk.trim();
  const lines = text.split("\n");
  let best = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const distance = Math.abs(i + 1 - bug.region.startLine);
    if (lines[i]!.trim() === trimmed && (best === -1 || distance < Math.abs(best + 1 - bug.region.startLine))) best = i;
  }
  if (best === -1) return null;
  lines[best] = bug.pristineHunk;
  return lines.join("\n");
}
