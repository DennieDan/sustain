// SAF-03: every diagram string reaches the map and its tooltip as text, never as markup.
import { afterEach, expect, test, vi } from "vitest";
import type { ViewDiagram } from "../../../src/core/tolerant";
import { renderScene } from "../../../src/viewer/render";
import { SHOW_DELAY_MS, TooltipController } from "../../../src/viewer/tooltip";
import { fixedMeasure, gridScene } from "../support/scene";

const SVG_NS = "http://www.w3.org/2000/svg";
const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
const LINK = "javascript:alert(3)";

const DIAGRAM: ViewDiagram = {
  components: [
    {
      id: "evil",
      type: "backend",
      label: HOSTILE,
      sublabel: HOSTILE,
      tag: HOSTILE,
      sources: [{ path: LINK, line: 1, label: HOSTILE }],
    },
    { id: "other", type: "frontend", label: "Other", sources: [] },
  ],
  connections: [{ from: "evil", to: "other", variant: "default", label: HOSTILE }],
  boundaries: [{ kind: "region", label: HOSTILE, wraps: ["evil"] }],
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

test("SAF-03 VWR-04 hostile labels, tags, paths and source labels render as plain text", () => {
  vi.useFakeTimers();
  const svg = document.createElementNS(SVG_NS, "svg");
  const content = document.createElementNS(SVG_NS, "g");
  svg.append(content);
  const tooltipElement = document.createElement("div");
  tooltipElement.hidden = true;
  document.body.replaceChildren(svg, tooltipElement);
  renderScene(content, DIAGRAM, gridScene(DIAGRAM), fixedMeasure);
  const tooltip = new TooltipController(svg, tooltipElement, () => {});
  tooltip.setDiagram(DIAGRAM);

  svg.querySelector('.node[data-id="evil"] .node__box')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  vi.advanceTimersByTime(SHOW_DELAY_MS);
  expect(tooltipElement.hidden).toBe(false);

  expect(document.querySelectorAll("img, script, a, iframe")).toHaveLength(0);
  // A box's accessible name holds the label as attribute text, which serializes `<` as it is.
  expect(svg.querySelector('.node[data-id="evil"]')!.getAttribute("aria-label")).toContain(HOSTILE);
  expect(document.body.innerHTML.replace(/ aria-label="[^"]*"/g, "")).not.toContain("<img");
  expect(svg.textContent).toContain(HOSTILE);
  expect(tooltipElement.textContent).toContain(HOSTILE);
  expect(tooltipElement.textContent).toContain(LINK);
  expect(document.querySelectorAll("[href], [onerror]")).toHaveLength(0);
});
