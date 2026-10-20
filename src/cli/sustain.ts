// `node dist/cli/sustain.mjs <command> [options]` (RCH-03): install, verify-skills, preflight and
// check. Prints one JSON object, or markdown with `--format markdown`. `--root <dir>` names the
// repository; the working directory otherwise.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check, cliHome, install, preflight, usage, verifySkills, type CliArgs, type CommandResult } from "./commands";

const COMMANDS: Record<string, (args: CliArgs) => CommandResult | Promise<CommandResult>> = {
  install,
  "verify-skills": verifySkills,
  preflight,
  check,
};

/** Options as `--name value…`; a flag without a value maps to an empty list. */
export function parseOptions(words: string[]): Map<string, string[]> | string {
  const options = new Map<string, string[]>();
  let current: string | null = null;
  for (const word of words) {
    if (word.startsWith("--")) {
      current = word;
      options.set(word, options.get(word) ?? []);
    } else if (current === null) {
      return `unexpected argument ${word}`;
    } else {
      options.get(current)!.push(word);
    }
  }
  return options;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const options = parseOptions(rest);
  const format = typeof options === "string" ? "json" : (options.get("--format")?.[0] ?? "json");
  let result: CommandResult;
  if (command === undefined || COMMANDS[command] === undefined) result = usage(`usage: sustain.mjs <${Object.keys(COMMANDS).join("|")}> [options]`);
  else if (typeof options === "string") result = usage(options);
  else if (format !== "json" && format !== "markdown") result = usage("--format is json or markdown");
  else result = await COMMANDS[command]!({ root: resolve(options.get("--root")?.[0] ?? process.cwd()), options, home: cliHome(fileURLToPath(import.meta.url)), env: process.env });
  process.stdout.write(format === "markdown" ? result.markdown : `${JSON.stringify(result.json, null, 2)}\n`);
  return result.exitCode;
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    process.stderr.write(`sustain.mjs: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  },
);
