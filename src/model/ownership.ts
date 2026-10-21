// PRC-01: which box a file belongs to. A file belongs to the boxes that cite it. Otherwise it
// belongs to the boxes that cite files in its nearest directory where any box cites a file.
// ACC-02, ARC-01 and ARC-03 use this too. Browser-safe.

interface Citing {
  id: string;
  sources?: readonly { path: string }[];
}

export class Ownership {
  private readonly byFile = new Map<string, Set<string>>();
  private readonly byDir = new Map<string, Set<string>>();
  /** Every directory with a cited file somewhere below it. */
  private readonly citedBelow = new Set<string>();

  constructor(components: readonly Citing[]) {
    for (const component of components) {
      for (const source of component.sources ?? []) {
        add(this.byFile, source.path, component.id);
        const dir = dirOf(source.path);
        add(this.byDir, dir, component.id);
        for (let up = dir; ; up = dirOf(up)) {
          this.citedBelow.add(up);
          if (up === "") break;
        }
      }
    }
  }

  /** The boxes that own `path`, nearest first; empty when none does. */
  owners(path: string): string[] {
    const direct = this.byFile.get(path);
    if (direct) return [...direct];
    for (let dir = dirOf(path); ; dir = dirOf(dir)) {
      const boxes = this.byDir.get(dir);
      if (boxes) return [...boxes];
      if (dir === "") return [];
    }
  }

  /** Whether some box cites a file in `dir` or below it. */
  ownsBelow(dir: string): boolean {
    return this.citedBelow.has(dir);
  }
}

/** The directory of a `/`-separated path, `""` for the repository root. */
export function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function add(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(id);
  map.set(key, set);
}
