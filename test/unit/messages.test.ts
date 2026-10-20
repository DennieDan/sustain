// SET-04: every notification the extension shows is listed in docs/messages.md with its kind, text
// and actions, and each error and warning offers exactly one action.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot, sourceFiles } from "./support/sourceScan";

type Kind = "info" | "warning" | "error";
const KINDS: Record<string, Kind> = { Information: "info", Warning: "warning", Error: "error" };

interface Shown {
  where: string;
  kind: Kind;
  /** The text with each interpolation as `{}`, or `null` when the call does not spell it out. */
  text: string | null;
  actions: (string | null)[];
}

interface Listed {
  id: string;
  kind: string;
  text: string;
  actions: string[];
}

/** The index just past the string, template or bracketed group that opens at `start`. */
function skip(source: string, start: number): number {
  const open = source[start]!;
  const close = open === "(" ? ")" : open === "[" ? "]" : open === "{" ? "}" : open;
  let i = start + 1;
  while (source[i] !== close) {
    if (i >= source.length) throw new Error(`unclosed ${open} at ${start}`);
    if (source[i] === "\\" && (open === '"' || open === "'" || open === "`")) i += 2;
    else if (open === "`" && source[i] === "$" && source[i + 1] === "{") i = skip(source, i + 1);
    else if (open !== '"' && open !== "'" && open !== "`" && /["'`([{]/.test(source[i]!)) i = skip(source, i);
    else i++;
  }
  return i + 1;
}

/** The arguments of the call whose `(` is at `open`, as source text. */
function callArgs(source: string, open: number): string[] {
  const end = skip(source, open) - 1;
  const args: string[] = [];
  let from = open + 1;
  for (let i = from; i < end; ) {
    if (source[i] === ",") {
      args.push(source.slice(from, i));
      from = ++i;
    } else i = /["'`([{]/.test(source[i]!) ? skip(source, i) : i + 1;
  }
  args.push(source.slice(from, end));
  return args.map((arg) => arg.trim()).filter((arg) => arg !== "");
}

function unescape(text: string): string {
  return text.replace(/\\(.)/g, (_match, char: string) => (char === "n" ? "\n" : char));
}

/** A string or template literal as its text with each interpolation as `{}`, else `null`. */
function literal(arg: string): string | null {
  const quote = arg[0];
  if ((quote === '"' || quote === "'" || quote === "`") && skip(arg, 0) === arg.length) {
    let text = "";
    for (let i = 1; i < arg.length - 1; ) {
      if (arg[i] === "\\") {
        text += unescape(arg.slice(i, i + 2));
        i += 2;
      } else if (quote === "`" && arg[i] === "$" && arg[i + 1] === "{") {
        text += "{}";
        i = skip(arg, i + 1);
      } else text += arg[i++];
    }
    return text;
  }
  return null;
}

/** Every notification call under `src/`. */
function shownMessages(): { shown: Shown[]; problems: string[] } {
  const shown: Shown[] = [];
  const problems: string[] = [];
  for (const file of sourceFiles("src")) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    for (const match of source.matchAll(/\bshow(Information|Warning|Error)Message\b/g)) {
      const where = `${file}:${source.slice(0, match.index).split("\n").length}`;
      const open = match.index + match[0].length;
      if (source[open] !== "(") {
        problems.push(`${where}: ${match[0]} is passed around rather than called with its text`);
        continue;
      }
      const [first = "", ...rest] = callArgs(source, open);
      // An action held in a variable, such as the verb of a run, counts as one action that fills in a name.
      const actions = rest.filter((arg) => !arg.startsWith("{")).map((arg) => (/^[A-Za-z_$][\w$]*$/.test(arg) ? "{}" : literal(arg)));
      shown.push({ where, kind: KINDS[match[1]!]!, text: literal(first), actions });
    }
  }
  return { shown, problems };
}

/** The rows of the table in docs/messages.md. */
function listedMessages(): Listed[] {
  const doc = readFileSync(join(repoRoot, "docs/messages.md"), "utf8");
  const cells = (line: string): string[] =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
  return doc
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ID ") && !/^\|[-\s|]+$/.test(line))
    .map((line) => {
      const [id = "", kind = "", text = "", action = ""] = cells(line);
      return { id: id.replace(/`/g, ""), kind, text: text.replace(/\{[^}]*\}/g, "{}"), actions: action === "—" ? [] : action.split("; ").map((one) => one.replace(/\{[^}]*\}/g, "{}")) };
    });
}

describe("SET-04 messages", () => {
  test("SET-04 every notification is listed in docs/messages.md, every row is shown somewhere, and each error and warning offers exactly one action", () => {
    const { shown, problems } = shownMessages();
    const listed = listedMessages();
    expect(shown.length).toBeGreaterThan(40);
    const ids = new Set<string>();
    for (const row of listed) {
      if (!/^[a-z][a-z0-9-]*$/.test(row.id)) problems.push(`docs/messages.md: "${row.id}" is not a kebab-case ID`);
      if (ids.has(row.id)) problems.push(`docs/messages.md: ${row.id} is listed twice`);
      ids.add(row.id);
      if (!["info", "warning", "error"].includes(row.kind)) problems.push(`docs/messages.md: ${row.id} has kind "${row.kind}"`);
    }
    const used = new Set<string>();
    for (const call of shown) {
      if (call.text === null || call.actions.includes(null)) {
        problems.push(`${call.where}: the message and its actions are not written out at the call`);
        continue;
      }
      if (call.kind !== "info" && call.actions.length !== 1) problems.push(`${call.where}: the ${call.kind} offers ${call.actions.length} actions`);
      const row = listed.find((entry) => entry.kind === call.kind && entry.text === call.text && entry.actions.join("; ") === call.actions.join("; "));
      if (row === undefined) problems.push(`${call.where}: ${call.kind} "${call.text}" with ${JSON.stringify(call.actions)} is not in docs/messages.md`);
      else used.add(row.id);
    }
    for (const row of listed) if (!used.has(row.id)) problems.push(`docs/messages.md: no call shows ${row.id}`);
    expect(problems).toEqual([]);
  });
});
