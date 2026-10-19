// Archify JSON v1 architecture diagrams: the subset Sustain reads (FR-MOD-01).
//
// Documents are handled as plain parsed JSON values typed with these interfaces. Nothing
// re-serialises through a field list, so fields not modelled here (`cards`, `legend`,
// `translations`, ...) survive any rewrite unchanged. Browser-safe: no imports.

export type ComponentType = "frontend" | "backend" | "database" | "cloud" | "security" | "messagebus" | "external";
export type Variant = "default" | "emphasis" | "security" | "dashed";
export type BoundaryKind = "region" | "security-group";
/** `[x, y]` */
export type Point = [number, number];

export interface Repository {
  url: string;
  revision: string;
  provider?: "github" | "gitee";
  link_mode?: "web" | "local-only";
}

export interface Meta {
  title: string;
  output: string;
  subtitle?: string;
  locale?: string;
  quality_profile?: "standard" | "showcase";
  repository?: Repository;
}

export interface GridLayout {
  mode: "grid";
  origin?: Point;
  cols?: number;
  gapX?: number;
  gapY?: number;
  cellW?: number;
  cellH?: number;
}

export interface SourceRef {
  path: string;
  line?: number;
  end_line?: number;
  label?: string;
}

export interface Component {
  id: string;
  type: ComponentType;
  label: string;
  sublabel?: string;
  tag?: string;
  sources?: SourceRef[];
  row?: number;
  col?: number;
  pos?: Point;
  /** `[width, height]` */
  size?: [number, number];
}

export interface Connection {
  id?: string;
  from: string;
  to: string;
  label?: string;
  variant?: Variant;
}

export interface Boundary {
  kind: BoundaryKind;
  label: string;
  wraps: string[];
}

export interface ArchifyDoc {
  schema_version: 1;
  diagram_type: "architecture";
  meta: Meta;
  layout?: GridLayout;
  components: Component[];
  connections?: Connection[];
  boundaries?: Boundary[];
}

/** Categories of validator findings; the validator prefixes each message with its code. */
export type IssueCode =
  | "Json"
  | "Schema"
  | "DuplicateId"
  | "MissingId"
  | "UnknownReference"
  | "MissingSources"
  | "BoundaryOverlap"
  | "InvalidCitationPath"
  | "DeniedCitation"
  | "BrokenCitation";

/** One finding, located by the RFC 6901 JSON pointer of the offending instance (`""` = whole document). */
export interface Issue {
  code: IssueCode;
  pointer: string;
  message: string;
}

/** A JSON object value, as produced by `JSON.parse`. */
export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Escapes one RFC 6901 reference token. */
export function pointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** The on-disk form Sustain writes: 2-space indented JSON with a trailing newline. */
export function stringifyDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
