import Mocha from "mocha";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Entry point @vscode/test-electron loads inside the Extension Development Host. Runs the
// files of the scenario runTest.ts launched this host for (`<scenario>.*.test.js`).
export function run(): Promise<void> {
  const scenario = process.env["SUSTAIN_E2E_SCENARIO"] ?? "single";
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 20_000 });
  for (const name of readdirSync(__dirname).sort()) {
    if (name.startsWith(`${scenario}.`) && name.endsWith(".test.js")) mocha.addFile(join(__dirname, name));
  }
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  mocha.run((failures) => {
    if (failures > 0) reject(new Error(`${failures} e2e test(s) failed`));
    else resolve();
  });
  return promise;
}
