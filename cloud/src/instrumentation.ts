// Runs once when the server starts, before it serves requests (RCH-05). The database opens here,
// so its migrations are applied at start and a failed migration stops the deploy's first boot.
export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { database } = await import("./db/client");
  await database();
}
