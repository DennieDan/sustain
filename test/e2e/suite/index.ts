import Mocha from "mocha";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Entry point @vscode/test-electron loads inside the Extension Development Host.
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 20_000 });
  for (const name of readdirSync(__dirname).sort()) {
    if (name.endsWith(".test.js")) mocha.addFile(join(__dirname, name));
  }
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  mocha.run((failures) => {
    if (failures > 0) reject(new Error(`${failures} e2e test(s) failed`));
    else resolve();
  });
  return promise;
}
