// ACC-02: whether the imports back the map. File imports become links between the boxes that own
// the files (PRC-01's ownership); arrows with no import path within two hops, box pairs with many
// links but no arrow, and boxes with neither are reported. Browser-safe: the caller passes the
// repository's files and a reader.
import { Ownership } from "../ownership";
import { javaImports, javaIndex } from "./java";
import { dirOf, joinPath, type ImportRef } from "./paths";
import { pythonImports, pythonIndex } from "./python";
import { CONFIG_NAMES, pathConfig, typescriptImports, type PathConfig } from "./typescript";

export type ImportLanguage = "java" | "typescript" | "python";

/** Import links a box pair needs for a missing arrow. */
export const MISSING_EDGE_LINKS = 3;
/** Words that make an arrow's label a protocol, which imports cannot show. */
export const PROTOCOL = /\b(https?|rest|grpc|rpc|graphql|websockets?|ws|sql|queries|queue[sd]?|kafka|amqp|mqtt|pub\/?sub|events?|webhooks?|smtp|ipc|postmessage|messages?|stream(s|ing)?|sse|tcp|udp)\b/i;

/** The import language of `path`, or `null`. */
export function importLanguage(path: string): ImportLanguage | null {
  if (path.endsWith(".java")) return "java";
  if (/\.py$/.test(path)) return "python";
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path) && !path.endsWith(".d.ts")) return "typescript";
  return null;
}

/**
 * A resolver for the repository `files`: given a file's path and text, the repository files it
 * imports, each at the line of its first import. Its indexes (Java packages, Python modules, tsconfig
 * paths) come from `files` through `read`.
 */
export function importResolver(files: readonly string[], read: (path: string) => string | null): (file: string, text: string) => ImportRef[] {
  const byLanguage = (language: ImportLanguage): string[] => files.filter((file) => importLanguage(file) === language);
  const all = new Set(files);
  const java = javaIndex(byLanguage("java"), read);
  const python = pythonIndex(byLanguage("python"));
  const configs = new Map<string, PathConfig | null>();
  const configFor = (dir: string): PathConfig | null => {
    if (configs.has(dir)) return configs.get(dir)!;
    let found: PathConfig | null = null;
    for (const name of CONFIG_NAMES) {
      const path = joinPath(dir, name)!;
      const text = all.has(path) ? read(path) : null;
      if (text !== null) {
        found = pathConfig(path, text);
        break;
      }
    }
    if (found === null && dir !== "") found = configFor(dirOf(dir));
    configs.set(dir, found);
    return found;
  };
  return (file, text) => {
    const language = importLanguage(file);
    if (language === "java") return javaImports(file, text, java);
    if (language === "python") return pythonImports(file, text, python);
    return language === "typescript" ? typescriptImports(file, text, all, configFor) : [];
  };
}

/** Each source file in a checked language, with the repository files it imports and their lines. */
export function importRefs(files: readonly string[], read: (path: string) => string | null): Map<string, ImportRef[]> {
  const resolve = importResolver(files, read);
  const refs = new Map<string, ImportRef[]>();
  for (const file of files) {
    if (importLanguage(file) === null) continue;
    const text = read(file);
    if (text !== null) refs.set(file, resolve(file, text));
  }
  return refs;
}

/** Each source file in a checked language, with the repository files it imports. */
export function importLinks(files: readonly string[], read: (path: string) => string | null): Map<string, string[]> {
  return new Map([...importRefs(files, read)].map(([file, refs]) => [file, refs.map((ref) => ref.path)]));
}

export interface ImportFinding {
  code: "UnsupportedEdge" | "MissingEdge" | "Isolated" | "NotChecked";
  /** `/connections/<i>` or `/components/<i>`. */
  pointer: string;
  /** The box, for `Isolated`. */
  component?: string;
  /** The arrow's id, for `UnsupportedEdge` and `NotChecked`, when it has one. */
  connection?: string;
  /** The two boxes, for `MissingEdge`. */
  between?: [string, string];
  /** Import links between the two boxes, for `MissingEdge`. */
  links?: number;
  message: string;
}

interface Box {
  id: string;
  label?: string;
  sources?: { path: string }[];
}

interface Arrow {
  id?: string;
  from: string;
  to: string;
  label?: string;
}

/** The import findings for a map, from `links` (see {@link importLinks}). */
export function checkImports(components: readonly Box[], connections: readonly Arrow[], links: ReadonlyMap<string, readonly string[]>): ImportFinding[] {
  const ownership = new Ownership(components);
  const label = new Map(components.map((component) => [component.id, component.label ?? component.id]));
  const languages = new Map<string, Set<ImportLanguage>>();
  const counts = new Map<string, Map<string, number>>();
  for (const [file, targets] of links) {
    const owners = ownership.owners(file);
    for (const owner of owners) languages.set(owner, (languages.get(owner) ?? new Set()).add(importLanguage(file)!));
    for (const target of targets) {
      for (const from of owners) {
        for (const to of ownership.owners(target)) {
          if (from === to) continue;
          const row = counts.get(from) ?? new Map<string, number>();
          row.set(to, (row.get(to) ?? 0) + 1);
          counts.set(from, row);
        }
      }
    }
  }
  const linked = (a: string, b: string): number => counts.get(a)?.get(b) ?? 0;
  const reaches = (a: string, b: string): boolean => linked(a, b) > 0 || [...(counts.get(a)?.keys() ?? [])].some((middle) => linked(middle, b) > 0);
  const arrowsBetween = (a: string, b: string): boolean => connections.some((arrow) => (arrow.from === a && arrow.to === b) || (arrow.from === b && arrow.to === a));

  const findings: ImportFinding[] = [];
  connections.forEach((arrow, index) => {
    const pointer = `/connections/${index}`;
    const from = languages.get(arrow.from);
    const to = languages.get(arrow.to);
    const id = arrow.id === undefined ? {} : { connection: arrow.id };
    const notChecked = (message: string): void => void findings.push({ code: "NotChecked", pointer, ...id, message });
    if (from === undefined || to === undefined) return notChecked("Not checked: one end has no code in Java, TypeScript, JavaScript or Python.");
    if (PROTOCOL.test(arrow.label ?? "")) return notChecked("Not checked: the arrow names a protocol, which imports cannot show.");
    if (![...from].some((language) => to.has(language))) return notChecked("Not checked: the arrow joins code in different languages.");
    if (!reaches(arrow.from, arrow.to) && !reaches(arrow.to, arrow.from)) {
      findings.push({
        code: "UnsupportedEdge",
        pointer,
        ...id,
        message: `No import path joins ${label.get(arrow.from)} and ${label.get(arrow.to)} within two hops. Cite where they work together, name the protocol in the label, or remove the arrow.`,
      });
    }
  });
  const ids = components.map((component) => component.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i]!, ids[j]!];
      const total = linked(a, b) + linked(b, a);
      if (total >= MISSING_EDGE_LINKS && !arrowsBetween(a, b)) {
        findings.push({ code: "MissingEdge", pointer: `/components/${i}`, between: [a, b], links: total, message: `${label.get(a)} and ${label.get(b)} share ${total} import links but no arrow. Add one if they work together.` });
      }
    }
  }
  components.forEach((component, index) => {
    if (!languages.has(component.id)) return;
    const touched = ids.some((other) => linked(component.id, other) + linked(other, component.id) > 0) || connections.some((arrow) => arrow.from === component.id || arrow.to === component.id);
    if (!touched) findings.push({ code: "Isolated", pointer: `/components/${index}`, component: component.id, message: `${label.get(component.id)} has no imports to or from other boxes, and no arrows. Connect it, merge it into a box it belongs to, or remove it.` });
  });
  return findings;
}
