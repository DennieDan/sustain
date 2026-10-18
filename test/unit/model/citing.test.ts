// UI-03: Show in Map highlights the boxes citing the active file.
import { expect, test } from "vitest";
import { citingBoxes, normalizeRel } from "../../../src/model/citing";
import type { ViewDiagram } from "../../../src/model/tolerant";

const DIAGRAM: ViewDiagram = {
  components: [
    { id: "panel", label: "Panel", type: "frontend", sources: [{ path: "./src/extension/panel.ts", line: 3 }] },
    { id: "model", label: "Model", type: "backend", sources: [{ path: "src/model/" }] },
    { id: "loose", label: "Loose", type: "backend", sources: [{ path: "src/extension/panel.tsx" }] },
    { id: "none", label: "None", type: "cloud", sources: [] },
  ],
  connections: [],
  boundaries: [],
};

test("UI-03 a box cites a file by its path or by a folder that holds it", () => {
  expect(citingBoxes(DIAGRAM, "src/extension/panel.ts")).toEqual(["panel"]);
  expect(citingBoxes(DIAGRAM, "src\\model\\tolerant.ts")).toEqual(["model"]);
  expect(citingBoxes(DIAGRAM, "src/modelling/x.ts")).toEqual([]);
  expect(citingBoxes(DIAGRAM, "README.md")).toEqual([]);
});

test("UI-03 paths compare without ./, backslashes or a trailing slash", () => {
  expect(normalizeRel("./src\\a/")).toBe("src/a");
});
