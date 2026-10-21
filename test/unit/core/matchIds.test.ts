// FR-UPD-09: post-hoc ID matching of a regenerated draft against the previous diagram.
import { describe, expect, it } from "vitest";
import { matchIds } from "../../../src/core/matchIds";

const comp = (id: string, files: string[], label = id) => ({
  id,
  type: "backend",
  label,
  sources: files.map((path) => ({ path, line: 1, end_line: 5 })),
});

const previous = {
  components: [comp("ui", ["Ui.java"]), comp("logic", ["Parser.java", "Command.java"]), comp("store", ["Storage.java"])],
  connections: [
    { id: "c1", from: "ui", to: "logic", label: "input" },
    { id: "c2", from: "logic", to: "store", label: "save" },
  ],
  boundaries: [{ kind: "region", label: "Core", wraps: ["logic", "store"] }],
};

type Doc = { components: { id: string }[]; connections: { id?: string; from: string }[]; boundaries: { wraps: string[] }[] };

describe("matchIds", () => {
  it("gives a regenerated draft the previous IDs back", () => {
    const draft = {
      components: [comp("view", ["Ui.java"], "ui"), comp("engine", ["Parser.java", "Command.java"], "logic"), comp("disk", ["Storage.java"], "store")],
      connections: [
        { id: "x1", from: "view", to: "engine", label: "input" },
        { id: "x2", from: "engine", to: "disk", label: "save" },
      ],
      boundaries: [{ kind: "region", label: "Core", wraps: ["engine", "disk"] }],
    };
    const { diagram, componentMap, connectionMap } = matchIds(previous, draft, 0.3);
    expect(componentMap).toEqual({ view: "ui", engine: "logic", disk: "store" });
    expect(connectionMap).toEqual({ x1: "c1", x2: "c2" });
    expect(diagram).toEqual(previous);
    expect(Object.keys(diagram)).toEqual(Object.keys(draft));
  });

  it("gives an unmatched draft component that reuses a previous ID a fresh ID", () => {
    const draft = {
      components: [comp("ui", ["Gui.java"]), comp("logic", ["Parser.java", "Command.java"]), comp("store", ["Storage.java"])],
      connections: [{ id: "c1", from: "ui", to: "logic" }],
    };
    const { diagram, renamed } = matchIds(previous, draft, 0.3);
    const doc = diagram as unknown as Doc;
    expect(renamed).toEqual({ ui: "ui-n1" });
    expect(doc.components.map((c) => c.id)).toEqual(["ui-n1", "logic", "store"]);
    expect(doc.connections[0]!.id).not.toBe("c1");
    expect(doc.connections[0]!.from).toBe("ui-n1");
  });

  it("does not match below the threshold and rejects thresholds outside (0, 1]", () => {
    const draft = { components: [comp("logic2", ["Parser.java", "Other.java", "More.java", "Even.java"])], connections: [] };
    expect(matchIds(previous, draft, 0.3).componentMap).toEqual({ logic2: "logic2" }); // Jaccard 1/5 = 0.2
    expect(matchIds(previous, draft, 0.2).componentMap).toEqual({ logic2: "logic" });
    for (const t of [0, -0.1, 1.01, Number.NaN]) expect(() => matchIds(previous, draft, t)).toThrow();
    expect(() => matchIds(previous, draft, 1)).not.toThrow();
  });

  it("gives a previous connection ID to only the first of two draft connections over its pair", () => {
    const draft = {
      components: [comp("view", ["Ui.java"]), comp("engine", ["Parser.java", "Command.java"])],
      connections: [
        { id: "a", from: "view", to: "engine", label: "input" },
        { id: "b", from: "view", to: "engine", label: "undo" },
      ],
    };
    const doc = matchIds(previous, draft, 0.3).diagram as unknown as Doc;
    expect(doc.connections.map((c) => c.id)).toEqual(["c1", "b"]);
  });

  it("tolerates a legacy previous candidate with id-less connections", () => {
    const legacy = {
      components: [{ id: "ui", label: "ui" }, comp("logic", ["Parser.java"]), "junk"],
      connections: [{ from: "ui", to: "logic" }, null],
    };
    const draft = {
      components: [comp("view", ["Ui.java"]), comp("engine", ["Parser.java"])],
      connections: [{ id: "k1", from: "view", to: "engine" }],
    };
    const { diagram, componentMap, connectionMap } = matchIds(legacy, draft);
    expect(componentMap).toEqual({ engine: "logic", view: "view" });
    expect(connectionMap).toEqual({});
    expect((diagram as unknown as Doc).connections).toEqual([{ id: "k1", from: "view", to: "logic" }]);
    expect(() => matchIds(null, draft)).not.toThrow();
  });
});
