// ENG-02: the layout budget compares a large layout with a small one timed on the same machine.

/** The large layout may take at most this many times the small one. */
export const BUDGET_FACTOR = 12;

export interface BudgetResult {
  /** Median milliseconds of the large layout. */
  subject: number;
  /** Median milliseconds of the small layout. */
  reference: number;
  ok: boolean;
}

/** Median of `runs` timed calls, after one untimed warm-up call. */
export async function timedMedian(run: () => Promise<unknown>, now: () => number, runs: number): Promise<number> {
  await run();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = now();
    await run();
    times.push(now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(runs / 2)]!;
}

/** Times both layouts and checks the large one against {@link BUDGET_FACTOR}. */
export async function checkLayoutBudget(
  subject: () => Promise<unknown>,
  reference: () => Promise<unknown>,
  now: () => number = () => performance.now(),
  runs = 5,
): Promise<BudgetResult> {
  const referenceMedian = await timedMedian(reference, now, runs);
  const subjectMedian = await timedMedian(subject, now, runs);
  return { subject: subjectMedian, reference: referenceMedian, ok: subjectMedian <= BUDGET_FACTOR * referenceMedian };
}
