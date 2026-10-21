// Waiting in e2e tests. The real file watchers and their 300 ms debounce run on the platform
// clock in the extension host, so there is no event to await from a test.

/** Resolves after `ms` milliseconds. */
export async function pause(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  await promise;
}

/** Polls `condition` every 50 ms for up to 10 s and names `what` on timeout. */
export async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await pause(50);
  }
}
