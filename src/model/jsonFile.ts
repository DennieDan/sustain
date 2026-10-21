// JSON files on disk. Writes go to a temp file that is renamed over the target, so watchers and
// readers only ever see whole files.
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { stringifyDocument } from "./types";

/** The parsed JSON in `path`. Throws when the file cannot be read, and throws a `SyntaxError` when it holds no JSON. */
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Writes `content` to a temp file beside `path`, flushes it and renames it over `path`. */
export function writeAtomic(path: string, content: string): void {
  const temp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${Date.now()}`);
  try {
    const fd = openSync(temp, "wx");
    try {
      writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/** Writes `value` as 2-space JSON with a trailing newline, atomically. */
export function writeJson(path: string, value: unknown): void {
  writeAtomic(path, stringifyDocument(value));
}
