// SKL-02: tour.json, a guided walk through a map, and the check tour-record.mjs runs on the tour
// skill's draft before writing it. Browser-safe.
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import tourSchema from "./schemas/tour.schema.json";
import type { Issue } from "./types";

export const TOUR_FILE = "tour.json";
export const TOUR_DRAFT_FILE = "tour-draft.json";
export const MIN_STOPS = 4;
export const MAX_STOPS = 12;

export interface TourStop {
  /** The box the stop is about. */
  component: string;
  title: string;
  /** At most 400 characters. */
  explanation: string;
  question: string;
  answer: string;
  citation: { path: string; line: number; end_line?: number };
}

export interface TourDraft {
  stops: TourStop[];
}

export interface Tour extends TourDraft {
  schema: 1;
  createdAt: string;
}

let compiled: ValidateFunction | undefined;

function toIssue(error: ErrorObject): Issue {
  const extra = error.keyword === "additionalProperties" ? ` \`${(error.params as { additionalProperty: string }).additionalProperty}\`` : "";
  return { code: "Schema", pointer: error.instancePath, message: `${error.message ?? "is invalid"}${extra}` };
}

/** Issues with `value` as a tour of `map`: the shape, then a box of the map for every stop. */
export function checkTourDraft(value: unknown, map: { components: readonly { id: string }[] }): Issue[] {
  compiled ??= new Ajv2020({ allErrors: true, strict: false }).compile(tourSchema);
  if (!compiled(value)) return (compiled.errors ?? []).map(toIssue);
  const ids = new Set(map.components.map((component) => component.id));
  return (value as TourDraft).stops.flatMap((stop, index) =>
    ids.has(stop.component) ? [] : [{ code: "UnknownReference", pointer: `/stops/${index}/component`, message: `the map has no box "${stop.component}"` }],
  );
}

/** The stops of a recorded tour, or `null` when `value` is not one; the viewer and the cloud read it this way. */
export function readTour(value: unknown): TourStop[] | null {
  if (typeof value !== "object" || value === null) return null;
  const stops = (value as { stops?: unknown }).stops;
  compiled ??= new Ajv2020({ allErrors: true, strict: false }).compile(tourSchema);
  return compiled({ stops }) ? (stops as TourStop[]) : null;
}
