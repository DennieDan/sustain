// FR-VIEW-05, FR-CMP-10/11: the SVG drawn for a scene has one element per node, edge and boundary,
// with the classes the theme colours hang on, text placed inside the boxes the layout sized, and
// change marks and element boxes addressed by the diagram's array indices.
import { describe, expect, test } from "vitest";
import { autoNodeSize } from "../../src/layout/measure";
import type { Scene } from "../../src/layout/scene";
import { diffDiagrams, markKept } from "../../src/model/diagramDiff";
import { parseDiagram, readDiagram } from "../../src/model/tolerant";
import type { ViewDiagram } from "../../src/model/tolerant";
import type { BoundaryKind, ComponentType, Variant } from "../../src/model/types";
import { archifyFixtures } from "../unit/support/fixtures";
import { applyMarks, elementBox, renderScene } from "../../webview/render";
import { BASELINE_DOC, CURRENT_DOC } from "./support/compare";
import { contentGroup, fixedMeasure, gridScene } from "./support/scene";

const TYPES: ComponentType[] = ["frontend", "backend", "database", "cloud", "security", "messagebus", "external"];
const VARIANTS: Variant[] = ["default", "emphasis", "security", "dashed"];
const KINDS: BoundaryKind[] = ["region", "security-group"];

function count<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function num(el: Element | null | undefined, name: string): number {
  return Number(el?.getAttribute(name));
}

/** One component of every type, one connection of every variant, both boundary kinds. */
const ALL_KINDS: ViewDiagram = {
  components: TYPES.map((type) => ({ id: `n-${type}`, label: `Node ${type}`, type, sources: [] })),
  connections: [
    { from: "n-frontend", to: "n-backend", variant: "default", label: "calls" },
    { from: "n-backend", to: "n-database", variant: "emphasis" },
    { from: "n-backend", to: "n-security", variant: "security", label: "auth" },
    { from: "n-backend", to: "n-messagebus", variant: "dashed" },
    { from: "n-cloud", to: "n-cloud", variant: "default" },
  ],
  boundaries: [
    { kind: "region", label: "App", wraps: ["n-frontend", "n-backend"] },
    { kind: "security-group", label: "Trust zone", wraps: ["n-security"] },
    { kind: "region", label: "", wraps: ["n-external"] },
  ],
};

describe("FR-VIEW-05 renderScene", () => {
  test.each(archifyFixtures().map((fixture) => [fixture.name, fixture.text] as const))(
    "%s: one element per component, connection and boundary, classed by type, variant and kind",
    (_name, text) => {
      const result = parseDiagram(text);
      if (!result.ok) throw new Error(result.reason);
      const diagram = result.diagram;
      const content = contentGroup();
      renderScene(content, diagram, gridScene(diagram), fixedMeasure);

      const nodes = [...content.querySelectorAll(".node")];
      expect(nodes.map((n) => n.getAttribute("data-id"))).toEqual(diagram.components.map((c) => c.id));
      for (const type of TYPES) {
        expect(content.querySelectorAll(`.node--${type}`).length, type).toBe(count(diagram.components, (c) => c.type === type));
      }
      expect(content.querySelectorAll(".edge").length).toBe(diagram.connections.length);
      for (const variant of VARIANTS) {
        expect(content.querySelectorAll(`.edge--${variant}`).length, variant).toBe(count(diagram.connections, (c) => c.variant === variant));
      }
      expect(content.querySelectorAll(".edge__head").length).toBe(diagram.connections.length);
      expect(content.querySelectorAll(".edge-label").length).toBe(count(diagram.connections, (c) => c.label !== undefined));
      expect(content.querySelectorAll(".boundary").length).toBe(diagram.boundaries.length);
      for (const kind of KINDS) {
        expect(content.querySelectorAll(`.boundary--${kind}`).length, kind).toBe(count(diagram.boundaries, (b) => b.kind === kind));
      }
      diagram.components.forEach((component, i) => {
        const node = nodes[i]!;
        expect(node.querySelector(".node__label")?.textContent).toBe(component.label);
        expect(node.querySelector(".node__sublabel")?.textContent).toBe(component.sublabel);
        expect(node.querySelector(".node__tag")?.textContent).toBe(component.tag);
        expect(node.querySelectorAll(".node__tag-badge").length).toBe(component.tag ? 1 : 0);
      });
    },
  );

  test("every type, variant and boundary kind gets its own class, in layer order", () => {
    const content = contentGroup();
    renderScene(content, ALL_KINDS, gridScene(ALL_KINDS), fixedMeasure);

    expect([...content.children].map((g) => g.getAttribute("class"))).toEqual(["boundaries", "edges", "edge-labels", "nodes"]);
    expect([...content.querySelectorAll(".node")].map((n) => n.getAttribute("class"))).toEqual(TYPES.map((t) => `node node--${t}`));
    expect([...content.querySelectorAll(".edge")].map((e) => e.getAttribute("class"))).toEqual([
      "edge edge--default",
      "edge edge--emphasis",
      "edge edge--security",
      "edge edge--dashed",
      "edge edge--default",
    ]);
    const edge = content.querySelector('.edge[data-index="2"]');
    expect([edge?.getAttribute("data-from"), edge?.getAttribute("data-to")]).toEqual(["n-backend", "n-security"]);
    expect([...content.querySelectorAll(".edge-label")].map((l) => [l.getAttribute("class"), l.getAttribute("data-index"), l.textContent])).toEqual([
      ["edge-label edge-label--default", "0", "calls"],
      ["edge-label edge-label--security", "2", "auth"],
    ]);
    expect([...content.querySelectorAll(".boundary")].map((b) => b.getAttribute("class"))).toEqual([
      "boundary boundary--region",
      "boundary boundary--security-group",
      "boundary boundary--region",
    ]);
    // A boundary without a label draws no label text.
    expect(content.querySelectorAll(".boundary__label").length).toBe(2);
  });

  test("rendering again replaces the previous drawing", () => {
    const content = contentGroup();
    renderScene(content, ALL_KINDS, gridScene(ALL_KINDS), fixedMeasure);
    renderScene(content, ALL_KINDS, gridScene(ALL_KINDS), fixedMeasure);
    expect(content.querySelectorAll(".node").length).toBe(TYPES.length);
    expect(content.children.length).toBe(4);
  });

  test("node boxes and boundary rectangles use the scene geometry", () => {
    const diagram: ViewDiagram = {
      components: [{ id: "a", label: "A", type: "backend", sources: [] }],
      connections: [],
      boundaries: [{ kind: "security-group", label: "Zone", wraps: ["a"] }],
    };
    const scene: Scene = {
      mode: "auto",
      nodes: [{ id: "a", index: 0, type: "backend", rect: { x: 40, y: 50, w: 130, h: 64 } }],
      boundaries: [{ index: 0, kind: "security-group", label: "Zone", rect: { x: 10, y: 20, w: 200, h: 120 }, nested: true }],
      edges: [],
      bounds: { x: 0, y: 0, w: 220, h: 150 },
    };
    const content = contentGroup();
    renderScene(content, diagram, scene, fixedMeasure);
    const box = content.querySelector(".node__box");
    expect(["x", "y", "width", "height"].map((a) => num(box, a))).toEqual([40, 50, 130, 64]);
    const rect = content.querySelector(".boundary__box");
    expect(["x", "y", "width", "height"].map((a) => num(rect, a))).toEqual([10, 20, 200, 120]);
    const label = content.querySelector(".boundary__label");
    expect(label?.textContent).toBe("Zone");
    expect([num(label, "x"), num(label, "y"), label?.getAttribute("text-anchor")]).toEqual([20, 36, "start"]);
  });

  test("label, sublabel and tag lines are stacked 1.32 em apart and centred in the box", () => {
    const diagram: ViewDiagram = {
      components: [{ id: "a", label: "Orders API", sublabel: "Go service", tag: "v2", type: "backend", sources: [] }],
      connections: [],
      boundaries: [],
    };
    const scene: Scene = {
      mode: "authored",
      nodes: [{ id: "a", index: 0, type: "backend", rect: { x: 0, y: 0, w: 200, h: 100 } }],
      boundaries: [],
      edges: [],
      bounds: { x: 0, y: 0, w: 200, h: 100 },
    };
    const content = contentGroup();
    renderScene(content, diagram, scene, fixedMeasure);
    const label = content.querySelector(".node__label");
    const sublabel = content.querySelector(".node__sublabel");
    const tag = content.querySelector(".node__tag");
    // Block height 14·1.32 + 12·1.32 + 11·1.32 = 48.84, so it starts at 50 − 24.42 = 25.58.
    expect(num(label, "y")).toBeCloseTo(25.58 + 9.24);
    expect(num(sublabel, "y")).toBeCloseTo(25.58 + 18.48 + 7.92);
    expect(num(tag, "y")).toBeCloseTo(25.58 + 18.48 + 15.84 + 7.26);
    expect([label, sublabel, tag].map((el) => num(el, "x"))).toEqual([100, 100, 100]);
    expect([label, sublabel, tag].map((el) => num(el, "font-size"))).toEqual([14, 12, 11]);
    expect([label, sublabel, tag].map((el) => el?.getAttribute("text-anchor"))).toEqual(["middle", "middle", "middle"]);
    const badge = content.querySelector(".node__tag-badge");
    // "v2" is 2 × 0.6 × 11 = 13.2 px wide, plus 4 px on each side, centred on the box.
    expect(num(badge, "width")).toBeCloseTo(21.2);
    expect(num(badge, "x")).toBeCloseTo(100 - 10.6);
    expect(num(badge, "y")).toBeCloseTo(25.58 + 18.48 + 15.84);
    expect(num(badge, "height")).toBeCloseTo(14.52);
  });

  test("a label-only node is centred vertically", () => {
    const diagram: ViewDiagram = { components: [{ id: "a", label: "A", type: "cloud", sources: [] }], connections: [], boundaries: [] };
    const scene: Scene = {
      mode: "authored",
      nodes: [{ id: "a", index: 0, type: "cloud", rect: { x: 10, y: 20, w: 120, h: 60 } }],
      boundaries: [],
      edges: [],
      bounds: { x: 0, y: 0, w: 140, h: 90 },
    };
    const content = contentGroup();
    renderScene(content, diagram, scene, fixedMeasure);
    expect(num(content.querySelector(".node__label"), "y")).toBeCloseTo(50);
    expect(content.querySelector(".node__sublabel")).toBeNull();
    expect(content.querySelector(".node__tag-badge")).toBeNull();
  });

  test("text fits inside an auto-sized box with 12 px horizontal and 10 px vertical padding", () => {
    const component = { id: "a", label: "Payment orchestrator", sublabel: "Kotlin + Spring Boot", tag: "critical path", type: "backend" as const, sources: [] };
    const { w, h } = autoNodeSize(component, fixedMeasure);
    const diagram: ViewDiagram = { components: [component], connections: [], boundaries: [] };
    const scene: Scene = {
      mode: "auto",
      nodes: [{ id: "a", index: 0, type: "backend", rect: { x: 0, y: 0, w, h } }],
      boundaries: [],
      edges: [],
      bounds: { x: 0, y: 0, w, h },
    };
    const content = contentGroup();
    renderScene(content, diagram, scene, fixedMeasure);
    const lines = [
      { el: content.querySelector(".node__label"), text: component.label, size: 14 },
      { el: content.querySelector(".node__sublabel"), text: component.sublabel, size: 12 },
      { el: content.querySelector(".node__tag"), text: component.tag, size: 11 },
    ];
    for (const { el, text, size } of lines) {
      const extent = fixedMeasure(text, size, false);
      const cx = num(el, "x");
      const cy = num(el, "y");
      expect(cx - extent.width / 2).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(cx + extent.width / 2).toBeLessThanOrEqual(w - 12 + 1e-9);
      expect(cy - extent.height / 2).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(cy + extent.height / 2).toBeLessThanOrEqual(h - 10 + 1e-9);
    }
  });

  test("edges end in an arrowhead at the last point, with the line stopping at its base", () => {
    const diagram: ViewDiagram = {
      components: [
        { id: "a", label: "A", type: "backend", sources: [] },
        { id: "b", label: "B", type: "backend", sources: [] },
      ],
      connections: [
        { from: "a", to: "b", variant: "emphasis" },
        { from: "b", to: "a", variant: "dashed" },
      ],
      boundaries: [],
    };
    const scene: Scene = {
      mode: "auto",
      nodes: [],
      boundaries: [],
      edges: [
        { index: 0, from: "a", to: "b", variant: "emphasis", points: [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 40, y: 50 }] },
        // A repeated last point: the direction comes from the last distinct point.
        { index: 1, from: "b", to: "a", variant: "dashed", points: [{ x: 100, y: 100 }, { x: 100, y: 0 }, { x: 100, y: 0 }] },
      ],
      bounds: { x: 0, y: 0, w: 100, h: 100 },
    };
    const content = contentGroup();
    renderScene(content, diagram, scene, fixedMeasure);
    const [first, second] = [...content.querySelectorAll(".edge")];
    expect(first?.querySelector(".edge__line")?.getAttribute("d")).toBe("M0 0 L0 50 L31 50");
    expect(first?.querySelector(".edge__head")?.getAttribute("d")).toBe("M40 50 L31 54.5 L31 45.5 Z");
    expect(second?.querySelector(".edge__line")?.getAttribute("d")).toBe("M100 100 L100 9");
    expect(second?.querySelector(".edge__head")?.getAttribute("d")).toBe("M100 0 L104.5 9 L95.5 9 Z");
  });
});

describe("FR-CMP-10 applyMarks and FR-CMP-11 elementBox", () => {
  const current = (() => {
    const result = readDiagram(CURRENT_DOC);
    if (!result.ok) throw new Error(result.reason);
    return result.diagram;
  })();
  const baseline = (() => {
    const result = readDiagram(BASELINE_DOC);
    if (!result.ok) throw new Error(result.reason);
    return result.diagram;
  })();
  const diff = markKept(diffDiagrams(baseline, current), current, new Set(["api"]));

  function marks(content: SVGGElement): [string | null, string | null, string[]][] {
    const statusClass = /--(added|changed|renamed|kept)$/;
    return [...content.querySelectorAll(".node, .edge, .boundary")].map((el) => [
      el.getAttribute("class")!.split(" ")[0]!,
      el.getAttribute("data-index"),
      [...el.classList].filter((c) => statusClass.test(c)),
    ]);
  }

  test("status classes per element and badges at the node's top-right and after the boundary label", () => {
    const content = contentGroup();
    renderScene(content, current, gridScene(current), fixedMeasure);
    applyMarks(content, diff, fixedMeasure);
    expect(marks(content)).toEqual([
      ["boundary", "0", ["boundary--renamed"]],
      ["boundary", "1", ["boundary--added"]],
      ["edge", "0", ["edge--changed"]],
      ["edge", "1", ["edge--added"]],
      ["node", "0", ["node--changed"]],
      ["node", "1", ["node--kept"]],
      ["node", "2", ["node--added"]],
    ]);
    const badges = [...content.querySelectorAll(".status-badge")];
    expect(badges.map((b) => [b.getAttribute("class"), b.textContent])).toEqual([
      ["status-badge status-badge--renamed", "RENAMED"],
      ["status-badge status-badge--added", "NEW"],
      ["status-badge status-badge--changed", "CHANGED"],
      ["status-badge status-badge--kept", "KEPT"],
      ["status-badge status-badge--added", "NEW"],
    ]);
    // Node web at (0, 0, 160, 80): the badge ends 8 px left of the right edge, centred on the top edge,
    // apart from the tag badge.
    const web = content.querySelector('.node[data-id="web"] .status-badge')!;
    const box = web.querySelector(".status-badge__box")!;
    expect(num(box, "x") + num(box, "width")).toBeCloseTo(152);
    expect(num(web.querySelector(".status-badge__text"), "y")).toBe(0);
    // Boundary "Application" at (-16, -16): after the label (10 px in, 11 chars × 7.2 px, 6 px gap), on its line.
    const application = content.querySelector('.boundary[data-index="0"] .status-badge')!;
    expect(num(application.querySelector(".status-badge__box"), "x")).toBeCloseTo(-16 + 10 + 11 * 7.2 + 6);
    expect(num(application.querySelector(".status-badge__text"), "y")).toBe(0);
  });

  test("applyMarks without a diff removes every mark and leaves the geometry", () => {
    const content = contentGroup();
    renderScene(content, current, gridScene(current), fixedMeasure);
    const plain = content.innerHTML;
    applyMarks(content, diff, fixedMeasure);
    applyMarks(content, diff, fixedMeasure);
    expect(content.querySelectorAll(".status-badge").length).toBe(5);
    applyMarks(content, undefined, fixedMeasure);
    expect(content.innerHTML).toBe(plain);
  });

  test("boundaries the layout left out do not shift the statuses of the others", () => {
    const content = contentGroup();
    const scene = gridScene(current);
    scene.boundaries = scene.boundaries.filter((b) => b.index === 1);
    renderScene(content, current, scene, fixedMeasure);
    applyMarks(content, diff, fixedMeasure);
    expect(marks(content).filter(([kind]) => kind === "boundary")).toEqual([["boundary", "1", ["boundary--added"]]]);
    expect(elementBox(content, "boundary", 0)).toBeUndefined();
  });

  test("elementBox: a node's box, a connection's endpoint boxes, a boundary's rectangle", () => {
    const content = contentGroup();
    renderScene(content, current, gridScene(current), fixedMeasure);
    expect(elementBox(content, "component", 2)).toEqual({ x: 440, y: 0, w: 160, h: 80 });
    expect(elementBox(content, "connection", 1)).toEqual({ x: 220, y: 0, w: 380, h: 80 });
    expect(elementBox(content, "boundary", 1)).toEqual({ x: 424, y: -16, w: 192, h: 112 });
    expect(elementBox(content, "component", 9)).toBeUndefined();
    expect(elementBox(content, "connection", 9)).toBeUndefined();
  });
});
