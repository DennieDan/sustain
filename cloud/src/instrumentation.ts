// Runs once when the server starts, before it serves requests (RCH-05). The database opens here,
// so its migrations are applied at start and a failed migration stops the deploy's first boot.
// Each plan's history is enforced now and then daily (CLD-13).
export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { database } = await import("./db/client");
  const db = await database();
  const { enforceRetention, RETENTION_INTERVAL_MS } = await import("./lib/retention");
  const enforce = (): void => {
    enforceRetention(db).catch((error: unknown) => console.error(`Retention failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  enforce();
  setInterval(enforce, RETENTION_INTERVAL_MS).unref();
}
