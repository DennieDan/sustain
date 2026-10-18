// CLD-08: public maps, from repositories whose owners made their maps public.
import { and, eq } from "drizzle-orm";
import { repositories } from "../../db/schema";
import { services } from "../../lib/services";
import { mainMap } from "../../lib/store";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const db = await services().db();
  const open = await db.select().from(repositories).where(and(eq(repositories.publicMaps, true), eq(repositories.private, false)));
  const shown = [];
  for (const repo of open) if (await mainMap(db, repo)) shown.push(repo);
  return (
    <main className="page">
      <h1>Gallery</h1>
      {shown.length === 0 ? (
        <p className="muted">No public maps yet.</p>
      ) : (
        <ul className="gallery">
          {shown.map((repo) => (
            <li key={repo.id}>
              <a href={`/${repo.owner}/${repo.name}`}>
                {repo.owner}/{repo.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
