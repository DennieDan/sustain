// Auto-layout node sizing (FR-LAY-02): stacked label, sublabel and tag lines plus padding.
import type { ViewComponent } from "../model/tolerant";
import type { MeasureText } from "./scene";

export const LABEL_PX = 14;
export const SUBLABEL_PX = 12;
export const TAG_PX = 11;
/** Horizontal padding on each side of the text block. */
const PAD_X = 12;
/** Vertical padding above and below the text block. */
const PAD_Y = 10;
const MIN_W = 120;
const MIN_H = 60;

/** Width × height of a component in auto mode, at least 120×60, rounded up to whole pixels. */
export function autoNodeSize(component: ViewComponent, measure: MeasureText): { w: number; h: number } {
  const lines = [measure(component.label, LABEL_PX, true)];
  if (component.sublabel) lines.push(measure(component.sublabel, SUBLABEL_PX, false));
  if (component.tag) lines.push(measure(component.tag, TAG_PX, false));
  const textW = Math.max(...lines.map((line) => line.width));
  const textH = lines.reduce((sum, line) => sum + line.height, 0);
  return { w: Math.ceil(Math.max(textW + 2 * PAD_X, MIN_W)), h: Math.ceil(Math.max(textH + 2 * PAD_Y, MIN_H)) };
}
