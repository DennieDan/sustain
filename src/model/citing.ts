// UI-03: the boxes whose sources cite a file. Browser-safe.
import type { ViewDiagram } from "./tolerant";

/** `path` as a `/`-separated repository-relative path, without `./` or a trailing `/`. */
export function normalizeRel(path: string): string {
  return path
    .split("\\")
    .join("/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
}

/** Ids of the components with a source that is `rel` or a folder holding it. */
export function citingBoxes(diagram: ViewDiagram, rel: string): string[] {
  const file = normalizeRel(rel);
  return diagram.components
    .filter((component) =>
      component.sources.some((source) => {
        const cited = normalizeRel(source.path);
        return cited !== "" && (cited === file || file.startsWith(`${cited}/`));
      }),
    )
    .map((component) => component.id);
}
