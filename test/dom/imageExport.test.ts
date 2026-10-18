// VWR-06: Save Image draws the shown map as an SVG that carries its theme colours, or paints it onto
// a canvas for a PNG at twice its size.
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ViewDiagram } from "../../src/model/tolerant";
import { mapPng, mapSvg } from "../../webview/imageExport";
import { renderScene } from "../../webview/render";
import { contentGroup, fixedMeasure, gridScene } from "./support/scene";

const DIAGRAM: ViewDiagram = {
  components: [
    { id: "web", label: "Web <ui>", type: "frontend", sources: [] },
    { id: "api", label: "API", type: "backend", sources: [] },
  ],
  connections: [{ from: "web", to: "api", variant: "dashed", label: "calls" }],
  boundaries: [],
};
const BACKGROUND = "#1e1e1e";

/** Stands in for Path2D, which happy-dom lacks, and keeps the path it was given. */
class FakePath {
  constructor(readonly d: string) {}
}

/** The map drawn as the viewer draws it, with theme colours from a stylesheet and a zoomed viewport. */
function drawn(): SVGGElement {
  const content = contentGroup();
  const style = document.createElement("style");
  style.textContent = [
    ".node__box { fill: #224466; stroke: #88aacc; stroke-width: 2px }",
    ".edge__line { fill: none; stroke: #999999; stroke-dasharray: 4 3 }",
    ".node__label { fill: #ffffff; font-family: Test Sans }",
  ].join("\n");
  document.head.replaceChildren(style);
  renderScene(content, DIAGRAM, gridScene(DIAGRAM), fixedMeasure);
  content.setAttribute("transform", "translate(5 7) scale(2)");
  return content;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VWR-06 image export", () => {
  test("the SVG frames the drawn map on the background, with its colours written onto each element and the live map's attributes left out", () => {
    const content = drawn();
    const bounds = gridScene(DIAGRAM).bounds;
    const text = mapSvg(content, bounds, BACKGROUND);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    const image = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
    expect(image.getAttribute("viewBox")).toBe(`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
    expect(image.firstElementChild?.getAttribute("fill")).toBe(BACKGROUND);
    const map = image.lastElementChild!;
    expect(map.hasAttribute("transform")).toBe(false);
    const boxes = [...map.querySelectorAll("rect")];
    expect(boxes.length).toBe(2);
    for (const box of boxes) expect(box.getAttribute("style")).toContain("fill:#224466;");
    expect(boxes[0]!.getAttribute("style")).toContain("stroke:#88aacc;");
    expect([...map.querySelectorAll("path")].some((path) => path.getAttribute("style")?.includes("stroke-dasharray:4 3"))).toBe(true);
    expect([...map.querySelectorAll("text")].map((label) => label.textContent)).toEqual(["calls", "Web <ui>", "API"]);
    expect(map.querySelectorAll("[class], [data-vscode-context], [tabindex], [aria-label], [data-id]").length).toBe(0);
    // The map on screen keeps its viewport and its classes.
    expect(content.getAttribute("transform")).toBe("translate(5 7) scale(2)");
    expect(content.querySelectorAll(".node[data-vscode-context]").length).toBe(2);
  });

  test("the PNG paints the background, each box, arrow and label onto a canvas at twice the map's size", () => {
    const content = drawn();
    const bounds = gridScene(DIAGRAM).bounds;
    const calls: string[] = [];
    const show = (value: unknown): string => (value instanceof FakePath ? `path ${value.d}` : JSON.stringify(value));
    const context = new Proxy(
      {},
      {
        get: (_target, name) => (...args: unknown[]) => calls.push(`${String(name)}(${args.map(show).join(", ")})`),
        set: (_target, name, value) => {
          calls.push(`${String(name)}=${show(value)}`);
          return true;
        },
      },
    );
    vi.stubGlobal("Path2D", FakePath);
    let size: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      size = [this.width, this.height];
      return context as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,UE5H");

    expect(mapPng(content, bounds, BACKGROUND)).toBe("data:image/png;base64,UE5H");
    expect(size).toEqual([Math.ceil(bounds.w * 2), Math.ceil(bounds.h * 2)]);
    expect(calls.slice(0, 4)).toEqual(["scale(2, 2)", `translate(${-bounds.x}, ${-bounds.y})`, `fillStyle="${BACKGROUND}"`, `fillRect(${bounds.x}, ${bounds.y}, ${bounds.w}, ${bounds.h})`]);
    const scene = gridScene(DIAGRAM);
    for (const node of scene.nodes) expect(calls).toContain(`roundRect(${node.rect.x}, ${node.rect.y}, ${node.rect.w}, ${node.rect.h}, 6)`);
    expect(calls).toContain('fillStyle="#224466"');
    expect(calls).toContain('strokeStyle="#88aacc"');
    expect(calls).toContain("setLineDash([4,3])");
    expect(calls.some((call) => call.startsWith("stroke(path M"))).toBe(true);
    for (const label of ["Web <ui>", "API", "calls"]) expect(calls.some((call) => call.startsWith(`fillText(${JSON.stringify(label)}, `))).toBe(true);
  });
});
