// `npm run bench:fit [--results <dir>] [--out <file>]` (CST-02): fits the estimate's coefficients
// from bench/results/*/result.json and writes src/model/coefficients.json, both relative to the
// working directory, which npm sets to the repository.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COEFFICIENTS } from "../src/model/estimate";
import { fitCoefficients, type BenchResult } from "../src/model/fit";


/** Every result under `dir`, skipping runs without a readable result.json. */
export function readResults(dir: string): BenchResult[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((run) => {
    try {
      return [JSON.parse(readFileSync(join(dir, run, "result.json"), "utf8")) as BenchResult];
    } catch {
      return [];
    }
  });
}

/** Fits from `resultsDir` into `outFile`, and says what changed. */
export function runFit(resultsDir: string, outFile: string, now = new Date()): string {
  const results = readResults(resultsDir);
  const { coefficients, fitted, kept } = fitCoefficients(results, COEFFICIENTS, now);
  writeFileSync(outFile, `${JSON.stringify(coefficients, null, 2)}\n`);
  return `bench:fit: ${results.length} results; fitted ${fitted.join(", ") || "nothing"}; kept ${kept.join(", ") || "nothing"}.\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name: string, fallback: string): string => {
    const at = process.argv.indexOf(name);
    return at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]!) : fallback;
  };
  process.stdout.write(runFit(option("--results", resolve("bench/results")), option("--out", resolve("src/model/coefficients.json"))));
}
