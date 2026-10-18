// ACC-01: a box is DeclarationOnly when every citation is at most 3 lines that only declare.
import { describe, expect, test } from "vitest";
import { checkEvidence, declarationOnly } from "../../../src/model/evidence";

describe("ACC-01 declaration-only heuristic", () => {
  test.each([
    [["export class PaymentService {"]],
    [["export interface Model {", "  id: string;", "}"]],
    [["def handle(request):"]],
    [["type Handler = (req: Request) => Response;"]],
    [["@Injectable()", "export class Store {"]],
    [["pub struct Config {", "}"]],
    [["import { save } from './db';"]],
  ])("%j only declares", (lines) => {
    expect(declarationOnly(lines)).toBe(true);
  });

  test.each([
    [["const body = parse(req);"]],
    [["  return save(body);"]],
    [["app.get('/pay', handler);"]],
    [["export async function pay(req) {", "  await charge(req.amount);", "}"]],
    [["export interface Big {", "  a: string;", "  b: string;", "  c: string;", "}"]],
    [["", "// only a comment", "}"]],
  ])("%j shows behaviour, is too long or declares nothing", (lines) => {
    expect(declarationOnly(lines)).toBe(false);
  });
});

describe("ACC-01 evidence report", () => {
  const files: Record<string, string> = {
    "src/model.ts": "export interface Model {\n  id: string;\n}\nexport const save = (m: Model) => db.insert(m);\n",
  };
  const read = (path: string): string | null => files[path] ?? null;

  test("a box is flagged only when every citation only declares; whole-file citations show enough", () => {
    const evidence = checkEvidence(
      [
        { id: "types", sources: [{ path: "src/model.ts", line: 1, end_line: 3 }] },
        { id: "mixed", sources: [{ path: "src/model.ts", line: 1 }, { path: "src/model.ts", line: 4 }] },
        { id: "whole", sources: [{ path: "src/model.ts" }] },
        { id: "none", sources: [] },
      ],
      read,
    );
    expect(evidence.findings.map((finding) => [finding.component, finding.pointer, finding.code])).toEqual([["types", "/components/0", "DeclarationOnly"]]);
  });
});
