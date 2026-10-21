// SAF-05: every Sustain write lands inside its root and never through a link.
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative } from "node:path";

/** Whether `childReal` is `parentReal` or lies below it. Both are real paths. */
export function isWithin(parentReal: string, childReal: string): boolean {
  const rel = relative(parentReal, childReal);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** `lstat` of `path`, or `null` when nothing is there. */
function lstatOrNull(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/** Throws when `path` is a link. Writing to it would write wherever the link points. */
export function assertNotLink(path: string): void {
  if (lstatOrNull(path)?.isSymbolicLink()) throw new Error(`${path} is a link. Sustain does not write through links.`);
}

/**
 * Throws unless writing `path` stays inside `root`. The nearest existing ancestor of `path`
 * must resolve inside `root`'s real path, and `path` itself must not be a link. Folders that
 * do not exist yet are fine, since creating them cannot leave the resolved ancestor.
 */
export function assertWritable(root: string, path: string): void {
  const rootReal = realpathSync(root);
  let ancestor = dirname(path);
  while (lstatOrNull(ancestor) === null && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
  let ancestorReal: string;
  try {
    ancestorReal = realpathSync(ancestor);
  } catch {
    throw new Error(`${path} would be written through a broken link at ${ancestor}`);
  }
  if (!isWithin(rootReal, ancestorReal)) throw new Error(`${path} would be written outside ${root}`);
  assertNotLink(path);
}
