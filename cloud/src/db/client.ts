// The database: PGlite in tests and local runs, in memory or in a folder. A managed Postgres for
// production needs its driver, which the owner adds with the hosting choice (see progress).
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { MIGRATIONS } from "./migrations";
import * as schema from "./schema";

export type Database = PgliteDatabase<typeof schema>;

/** Applies the migrations not yet recorded. */
async function migrate(client: PGlite): Promise<void> {
  await client.exec("CREATE TABLE IF NOT EXISTS migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await client.query<{ id: string }>("SELECT id FROM migrations")).rows.map((row) => row.id));
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    await client.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO migrations (id) VALUES ($1)", [migration.id]);
    });
  }
}

/** A migrated database in `dataDir`, or in memory without one. */
export async function openDatabase(dataDir?: string): Promise<Database> {
  const client = dataDir === undefined ? new PGlite() : new PGlite(dataDir);
  await migrate(client);
  return drizzle({ client, schema });
}

let shared: Promise<Database> | undefined;

/** The app's database, from `SUSTAIN_DB`: `memory`, or a PGlite folder. */
export function database(): Promise<Database> {
  shared ??= (() => {
    const setting = process.env["SUSTAIN_DB"] ?? "memory";
    if (/^postgres(ql)?:/.test(setting)) throw new Error("A Postgres URL needs the production driver; see the deployment notes in progress-v0.3.md.");
    return openDatabase(setting === "memory" ? undefined : setting);
  })();
  return shared;
}
