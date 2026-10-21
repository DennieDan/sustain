// The Action's entry point (PRC-04), bundled to action/dist/index.js and committed.
import { appendFileSync, readFileSync } from "node:fs";
import { restClient } from "./github";
import { runAction } from "./main";

async function main(): Promise<number> {
  const env = process.env;
  const event: unknown = JSON.parse(readFileSync(env["GITHUB_EVENT_PATH"] ?? "", "utf8"));
  const client = restClient(env["GITHUB_API_URL"] ?? "https://api.github.com", env["GITHUB_REPOSITORY"] ?? "", env["INPUT_GITHUB-TOKEN"] ?? "");
  const outcome = await runAction({ env, root: env["GITHUB_WORKSPACE"] ?? process.cwd(), event, client, log: (line) => process.stdout.write(`${line}\n`) });
  if (env["GITHUB_OUTPUT"]) appendFileSync(env["GITHUB_OUTPUT"], `result=${outcome.result}\n`);
  if (env["GITHUB_STEP_SUMMARY"] && outcome.comment !== null) appendFileSync(env["GITHUB_STEP_SUMMARY"], `${outcome.comment}\n`);
  return outcome.exitCode;
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    process.stdout.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
