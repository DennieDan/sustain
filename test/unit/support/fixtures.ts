import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "./sourceScan";

export interface Fixture {
  /** Path below `fixtures/archify/`, e.g. `examples/archify-repo.architecture.json`. */
  name: string;
  text: string;
}

/** The 24 vendored Archify fixtures, sorted by name. */
export function archifyFixtures(): Fixture[] {
  const base = join(repoRoot, "fixtures/archify");
  const out: Fixture[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith(".json")) out.push({ name: relative(base, path).split("\\").join("/"), text: readFileSync(path, "utf8") });
    }
  };
  walk(base);
  return out;
}
