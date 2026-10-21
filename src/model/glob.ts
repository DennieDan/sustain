// Path globs, as the rules and the check's ignore list write them. Browser-safe.

/** A path glob as a regular expression: `**` crosses folders, `*` and `?` stay inside one. */
export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      pattern += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // A plain folder name also matches everything below it.
  return new RegExp(`^${pattern}(?:/.*)?$`);
}
