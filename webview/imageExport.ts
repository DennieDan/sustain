// VWR-06: the map as an image, for Save Image. The SVG copies the drawn map with each element's
// computed colours, strokes and fonts written onto it, on the theme's background. The PNG paints
// the same boxes, arrows and text onto a canvas. Neither loads anything, so the page's CSP stays.
import type { Rect } from "../src/layout/scene";

const SVG_NS = "http://www.w3.org/2000/svg";
/** The computed properties each copied element keeps. */
const STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "opacity", "font-family", "font-size", "font-weight", "paint-order"];
/** Attributes that serve the live map only. */
const LIVE_ATTRIBUTES = ["class", "data-vscode-context", "tabindex", "role", "aria-label", "data-index", "data-id", "data-from", "data-to"];
/** The PNG's pixels per map unit. */
const PNG_SCALE = 2;
/** The longest side a canvas can have. */
const MAX_CANVAS_SIDE = 16384;

/** The drawn map under `content`, framed by `bounds`, as a standalone SVG document. */
export function mapSvg(content: SVGGElement, bounds: Rect, background: string): string {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
  svg.setAttribute("width", String(Math.ceil(bounds.w)));
  svg.setAttribute("height", String(Math.ceil(bounds.h)));
  const back = document.createElementNS(SVG_NS, "rect");
  for (const [name, value] of Object.entries({ x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h, fill: background })) back.setAttribute(name, String(value));
  const copy = content.cloneNode(true) as SVGGElement;
  copy.removeAttribute("transform");
  const originals = [content, ...content.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    const declarations = STYLE_PROPS.map((property) => [property, style.getPropertyValue(property).trim()]).filter(([, value]) => value !== "");
    const target = copies[index]!;
    for (const name of LIVE_ATTRIBUTES) target.removeAttribute(name);
    if (declarations.length > 0) target.setAttribute("style", declarations.map(([property, value]) => `${property}:${value}`).join(";"));
  });
  svg.append(back, copy);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}\n`;
}

function number(value: string | null, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The product of the opacities from `element` up to `top`, as dimmed and see-through boxes need. */
function opacityOf(element: Element, top: Element): number {
  let opacity = 1;
  for (let node: Element | null = element; node !== null && node !== top.parentElement; node = node.parentElement) opacity *= number(getComputedStyle(node).getPropertyValue("opacity"), 1);
  return opacity;
}

/** The drawn map under `content`, framed by `bounds`, as a PNG data URL at twice its size, or less for a map too large for a canvas. */
export function mapPng(content: SVGGElement, bounds: Rect, background: string): string {
  const scale = Math.min(PNG_SCALE, MAX_CANVAS_SIDE / bounds.w, MAX_CANVAS_SIDE / bounds.h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.w * scale);
  canvas.height = Math.ceil(bounds.h * scale);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("this page cannot draw on a canvas");
  context.scale(scale, scale);
  context.translate(-bounds.x, -bounds.y);
  context.fillStyle = background;
  context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  for (const element of content.querySelectorAll("rect, path, text")) {
    const style = getComputedStyle(element);
    const fill = style.getPropertyValue("fill").trim();
    const stroke = style.getPropertyValue("stroke").trim();
    const width = number(style.getPropertyValue("stroke-width"), 1);
    const dash = style.getPropertyValue("stroke-dasharray").trim();
    const fills = fill !== "" && fill !== "none";
    const strokes = stroke !== "" && stroke !== "none" && width > 0;
    context.save();
    context.globalAlpha = opacityOf(element, content);
    context.lineWidth = width;
    context.setLineDash(dash === "" || dash === "none" ? [] : dash.split(/[\s,]+/).map((part) => number(part)));
    context.fillStyle = fills ? fill : "black";
    if (strokes) context.strokeStyle = stroke;
    const tag = element.tagName.toLowerCase();
    if (tag === "rect") {
      context.beginPath();
      context.roundRect(number(element.getAttribute("x")), number(element.getAttribute("y")), number(element.getAttribute("width")), number(element.getAttribute("height")), number(element.getAttribute("rx")));
      if (fills) context.fill();
      if (strokes) context.stroke();
    } else if (tag === "path") {
      const shape = new Path2D(element.getAttribute("d") ?? "");
      if (fills) context.fill(shape);
      if (strokes) context.stroke(shape);
    } else {
      const text = element.textContent ?? "";
      const x = number(element.getAttribute("x"));
      const y = number(element.getAttribute("y"));
      context.font = `${style.getPropertyValue("font-weight") || "normal"} ${number(element.getAttribute("font-size"), 12)}px ${style.getPropertyValue("font-family") || "sans-serif"}`;
      context.textAlign = element.getAttribute("text-anchor") === "middle" ? "center" : "start";
      context.textBaseline = "middle";
      // A label's halo is its stroke, painted under the text.
      if (strokes) context.strokeText(text, x, y);
      context.fillText(text, x, y);
    }
    context.restore();
  }
  return canvas.toDataURL("image/png");
}
