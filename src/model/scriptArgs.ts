// The command lines of the skill scripts. Each script names its arguments, and a usage error goes
// to stderr with exit code 2 (ADR 0017).

/** The arguments a script accepts. */
export interface ArgSpec {
  /** How many leading arguments are taken as they are, before any flag. */
  positionals?: number;
  /** Flags that take the next argument as their value, without the leading `--`. */
  options?: readonly string[];
  /** Flags that take no value, without the leading `--`. */
  switches?: readonly string[];
  /** Whether a flag may appear more than once. The last value of an option counts. */
  repeatable?: boolean;
}

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string>;
  switches: Set<string>;
}

/**
 * Splits `args` by `spec`, or gives `null` when an argument is missing or unknown, an option lacks
 * its value, or a flag repeats without `repeatable`. An option's value is the next argument,
 * whatever it is.
 */
export function parseArgs(args: readonly string[], spec: ArgSpec): ParsedArgs | null {
  const count = spec.positionals ?? 0;
  if (args.length < count) return null;
  const parsed: ParsedArgs = { positionals: args.slice(0, count), options: {}, switches: new Set() };
  const seen = new Set<string>();
  for (let i = count; i < args.length; i += 1) {
    const arg = args[i]!;
    const name = arg.startsWith("--") ? arg.slice(2) : null;
    if (name === null || (seen.has(name) && spec.repeatable !== true)) return null;
    seen.add(name);
    if (spec.switches?.includes(name)) {
      parsed.switches.add(name);
    } else if (spec.options?.includes(name)) {
      const value = args[i + 1];
      if (value === undefined) return null;
      parsed.options[name] = value;
      i += 1;
    } else {
      return null;
    }
  }
  return parsed;
}

/** Writes `<script>: <message>` to stderr and gives the usage exit code, 2. */
export function usageError(script: string, message: string): number {
  process.stderr.write(`${script}: ${message}\n`);
  return 2;
}
