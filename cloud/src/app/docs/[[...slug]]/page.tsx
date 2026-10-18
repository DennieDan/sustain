// CLD-08: the docs, rendered from the repository's README and docs/.
import { notFound } from "next/navigation";
import { Markdown } from "../../../components/Markdown";
import { loadDoc, PUBLISHED_DOCS } from "../../../lib/docs";

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const doc = slug.length > 1 ? null : loadDoc(slug[0] ?? "");
  if (!doc) notFound();
  return (
    <main className="page">
      <nav className="muted">
        {PUBLISHED_DOCS.map((entry, index) => (
          <span key={entry.slug}>
            {index > 0 ? " · " : ""}
            <a href={entry.slug === "" ? "/docs" : `/docs/${entry.slug}`}>{entry.title}</a>
          </span>
        ))}
      </nav>
      <Markdown blocks={doc.blocks} />
    </main>
  );
}
