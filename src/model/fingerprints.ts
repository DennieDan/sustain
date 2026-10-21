// FRS-01: what each cited file and range looked like when a map was accepted, so later edits can
// be told apart from moves. No file content is stored, only hashes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertWritable } from "./confine";
import { writeJson } from "./session";
import type { ArchifyDoc } from "./types";

export const FINGERPRINTS_FILE = "fingerprints.json";

export interface CitationPrint {
  /** The citing component's id and the citation's index in its `sources`. */
  component: string;
  index: number;
  path: string;
  line?: number;
  end_line?: number;
  /** The git blob id of the file's content. */
  blob: string;
  /** SHA-256 of the cited lines, normalized; only for a citation with lines. */
  range?: string;
  /** The same with leading whitespace also trimmed, so a re-indented block is found as moved. */
  loose?: string;
}

export interface Fingerprints {
  schema: 1;
  /** HEAD when the map was accepted, or `null` outside a git repository. */
  revision: string | null;
  createdAt: string;
  citations: CitationPrint[];
}

/** The id `git hash-object --no-filters` gives these bytes. */
export function gitBlobId(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** The file's lines as staleness compares them: split on `\n`, without `\r` or trailing whitespace. */
export function normalizedLines(text: string): string[] {
  return text.split("\n").map((line) => line.trimEnd());
}

export function hashLines(lines: readonly string[]): string {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** `lines` with leading whitespace trimmed too. */
export function looseLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trimStart());
}

/** The prints of every citation in `doc`, whose files lie in `root` and were checked by the validator. */
export function fingerprint(doc: ArchifyDoc, root: string, revision: string | null, now = new Date()): Fingerprints {
  const contents = new Map<string, Buffer>();
  const citations: CitationPrint[] = [];
  for (const component of doc.components) {
    (component.sources ?? []).forEach((source, index) => {
      let bytes = contents.get(source.path);
      if (bytes === undefined) {
        bytes = readFileSync(join(root, ...source.path.split("/")));
        contents.set(source.path, bytes);
      }
      const print: CitationPrint = { component: component.id, index, path: source.path, blob: gitBlobId(bytes) };
      if (source.line !== undefined) {
        print.line = source.line;
        const end = source.end_line ?? source.line;
        if (source.end_line !== undefined) print.end_line = source.end_line;
        const block = normalizedLines(bytes.toString("utf8")).slice(source.line - 1, end);
        print.range = hashLines(block);
        print.loose = hashLines(looseLines(block));
      }
      citations.push(print);
    });
  }
  return { schema: 1, revision, createdAt: now.toISOString(), citations };
}

export function writeFingerprints(root: string, runDir: string, prints: Fingerprints): void {
  const path = join(runDir, FINGERPRINTS_FILE);
  assertWritable(root, path);
  writeJson(path, prints);
}
