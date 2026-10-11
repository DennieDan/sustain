// FR-NAV-01: clicking a node posts openSource for its first source; a drag does not.
import { beforeEach, describe, expect, test } from "vitest";
import type { WebviewMessage } from "../../src/model/messages";
import type { ViewDiagram } from "../../src/model/tolerant";
import { NodeClicks } from "../../webview/click";
import { renderScene } from "../../webview/render";
import { fixedMeasure, gridScene } from "./support/scene";

const SVG_NS = "http://www.w3.org/2000/svg";

const DIAGRAM: ViewDiagram = {
  components: [
    { id: "api", label: "API", type: "backend", sources: [{ path: "src/api.ts", line: 3 }] },
    { id: "db", label: "DB", type: "database", sources: [] },
  ],
  connections: [{ from: "api", to: "db", variant: "default" }],
  boundaries: [],
};

describe("FR-NAV-01 node click", () => {
  let svg: SVGSVGElement;
  let posted: WebviewMessage[];

  beforeEach(() => {
    svg = document.createElementNS(SVG_NS, "svg");
    const content = document.createElementNS(SVG_NS, "g");
    svg.append(content);
    renderScene(content, DIAGRAM, gridScene(DIAGRAM), fixedMeasure);
    document.body.replaceChildren(svg);
    posted = [];
    new NodeClicks(svg, (message) => posted.push(message));
  });

  function part(id: string, selector: string): Element {
    return svg.querySelector(`.node[data-id="${id}"] ${selector}`)!;
  }

  function press(target: Element, x: number, y: number, init: PointerEventInit = {}): void {
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: y, ...init }));
  }

  function release(target: Element, x: number, y: number, init: PointerEventInit = {}): void {
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: y, ...init }));
  }

  test("a click on any part of a node posts openSource with index 0", () => {
    press(part("api", ".node__label"), 100, 100);
    release(part("api", ".node__box"), 100, 100);
    expect(posted).toEqual([{ type: "openSource", componentId: "api", index: 0 }]);
  });

  test("a node without sources still posts; the host reports the missing sources", () => {
    press(part("db", ".node__box"), 10, 10);
    release(part("db", ".node__box"), 12, 12);
    expect(posted).toEqual([{ type: "openSource", componentId: "db", index: 0 }]);
  });

  test.each([
    [3.9, 0, 1],
    [0, 3.9, 1],
    [2.8, 2.8, 1],
    [4, 0, 0],
    [3, 3, 0],
    [40, 0, 0],
  ])("moving (%f, %f) px between press and release posts %i message(s)", (dx, dy, count) => {
    press(part("api", ".node__box"), 50, 50);
    release(part("api", ".node__box"), 50 + dx, 50 + dy);
    expect(posted).toHaveLength(count);
  });

  test("releasing on another node, on empty canvas or with another pointer posts nothing", () => {
    press(part("api", ".node__box"), 0, 0);
    release(part("db", ".node__box"), 0, 0);
    press(part("api", ".node__box"), 0, 0);
    release(svg, 0, 0);
    press(part("api", ".node__box"), 0, 0);
    release(part("api", ".node__box"), 0, 0, { pointerId: 2 });
    expect(posted).toEqual([]);
  });

  test("a press outside nodes, a secondary button or a cancelled pointer posts nothing", () => {
    press(svg, 0, 0);
    release(part("api", ".node__box"), 0, 0);
    press(part("api", ".node__box"), 0, 0, { button: 2 });
    release(part("api", ".node__box"), 0, 0, { button: 2 });
    press(part("api", ".node__box"), 0, 0);
    svg.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
    release(part("api", ".node__box"), 0, 0);
    expect(posted).toEqual([]);
  });
});
