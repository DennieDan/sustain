// CLD-08: the documents the site publishes, read from the repository at request time.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, type Block } from "./markdown";

/** Published pages: `slug` under /docs, the repository file it renders. */
export const PUBLISHED_DOCS: readonly { slug: string; file: string; title: string }[] = [
  { slug: "", file: "README.md", title: "Overview" },
  { slug: "architecture", file: "docs/architecture.md", title: "Architecture" },
  { slug: "spec", file: "docs/spec-v0.3.md", title: "Specification" },
];

/** The docs page a repository-relative markdown link points at, or `null` when it is not published. */
export function docPath(from: string, href: string): string | null {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const parts: string[] = [];
  for (const part of `${base}${href}`.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  const doc = PUBLISHED_DOCS.find((entry) => entry.file === parts.join("/"));
  return doc === undefined ? null : doc.slug === "" ? "/docs" : `/docs/${doc.slug}`;
}

/** The repository root: the cloud runs from cloud/. */
function repositoryRoot(): string {
  return join(process.cwd(), "..");
}

export function loadDoc(slug: string): { title: string; blocks: Block[] } | null {
  const doc = PUBLISHED_DOCS.find((entry) => entry.slug === slug);
  if (!doc) return null;
  // The build traces the published files through outputFileTracingIncludes in next.config.ts.
  const text = readFileSync(join(/*turbopackIgnore: true*/ repositoryRoot(), doc.file), "utf8");
  return { title: doc.title, blocks: parseMarkdown(text, (href) => docPath(doc.file, href)) };
}
