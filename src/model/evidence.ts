// ACC-01: whether each box cites behaviour or only declarations. A box is DeclarationOnly when
// every citation is at most 3 lines and those lines only declare something. ACC-02 adds what the
// imports say about each arrow and box (see evidence/graph.ts). Browser-safe; the validator passes
// in the cited files' text and the import links.
import { checkImports, type ImportFinding } from "./evidence/graph";

export const EVIDENCE_FILE = "evidence.json";

/** Longest citation that can be declaration-only. */
export const MAX_DECLARATION_LINES = 3;

export interface EvidenceFinding {
  code: "DeclarationOnly";
  /** `/components/<i>`. */
  pointer: string;
  component: string;
  message: string;
}

export interface Evidence {
  schema: 1;
  findings: (EvidenceFinding | ImportFinding)[];
}

const DECLARATION =
  /^(export\s+)?(default\s+)?((abstract|public|private|protected|internal|static|final|sealed|open|data|async|pub|readonly|declare)\s+)*(class|interface|type|enum|struct|trait|protocol|module|namespace|function|func|fn|def|const|let|var|val|import|from|package|use|record|object|impl|mod)\b/;

/** Lines that neither declare nor do anything: blanks, braces, comments and decorators. */
function neutral(line: string): boolean {
  return line === "" || /^[{}()[\];,]+$/.test(line) || /^(\/\/|#|\*|\/\*|--|@)/.test(line);
}

/** A typed member such as `id: string;` or `readonly name?: Name,`. */
const MEMBER = /^(readonly\s+)?[\w$]+\??\s*:\s*[^=()]+[;,]?$/;

/** The head of a function signature, whose parentheses are not a call. */
const SIGNATURE = /(function\*?|def|fn|func)\s+[\w$]+\s*(<[^>]*>)?\s*\(/;

/** A declaration that does no work: no return, await or throw, and no call outside its own signature. */
function declares(line: string): boolean {
  if (/\b(return|await|yield|throw)\b/.test(line)) return false;
  if (/[\w$\]]\s*\(/.test(line.replace(SIGNATURE, ""))) return false;
  return DECLARATION.test(line) || MEMBER.test(line);
}

/** Whether cited `lines` are short and only declare. */
export function declarationOnly(lines: readonly string[]): boolean {
  if (lines.length > MAX_DECLARATION_LINES) return false;
  const content = lines.map((line) => line.trim()).filter((line) => !neutral(line));
  return content.length > 0 && content.every(declares);
}

interface Cited {
  id: string;
  sources?: { path: string; line?: number; end_line?: number }[];
}

/**
 * The evidence report for `components`; `read` gives a cited file's text, or `null`. With `imports`,
 * the arrows and boxes are checked against the repository's import links too (ACC-02).
 */
export function checkEvidence(
  components: readonly Cited[],
  read: (path: string) => string | null,
  imports?: { connections: readonly { id?: string; from: string; to: string; label?: string }[]; links: ReadonlyMap<string, readonly string[]> },
): Evidence {
  const findings: (EvidenceFinding | ImportFinding)[] = [];
  components.forEach((component, index) => {
    const sources = component.sources ?? [];
    if (sources.length === 0) return;
    const onlyDeclarations = sources.every((source) => {
      if (source.line === undefined) return false;
      const text = read(source.path);
      if (text === null) return false;
      return declarationOnly(text.split("\n").slice(source.line - 1, source.end_line ?? source.line));
    });
    if (onlyDeclarations) {
      findings.push({
        code: "DeclarationOnly",
        pointer: `/components/${index}`,
        component: component.id,
        message: "Every citation only declares something. Cite a range that shows the behaviour: a call site, a handler body, a registration, a query or a write.",
      });
    }
  });
  if (imports !== undefined) findings.push(...checkImports(components, imports.connections, imports.links));
  return { schema: 1, findings };
}
