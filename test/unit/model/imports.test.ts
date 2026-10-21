// ACC-02: imports per language, and what they say about the map's arrows and boxes.
import { describe, expect, test } from "vitest";
import { checkImports, importLinks } from "../../../src/model/evidence/graph";

/** importLinks over an in-memory repository. */
function links(files: Record<string, string>): Map<string, string[]> {
  return importLinks(Object.keys(files).sort(), (path) => files[path] ?? null);
}

describe("ACC-02 imports", () => {
  test("Java: imports, static and wildcard imports and nested classes resolve through the package declarations, and same-package classes count by name", () => {
    const root = "src/main/java/com/acme";
    const found = links({
      [`${root}/app/Main.java`]: [
        "package com.acme.app;",
        "import java.util.List;",
        "import com.acme.store.Repo;",
        "import com.acme.store.Repo.Entry;",
        "import static com.acme.util.Strings.trim;",
        "import com.acme.api.*;",
        "class Main { Helper helper; List<Entry> entries; }",
      ].join("\n"),
      [`${root}/app/Helper.java`]: "package com.acme.app;\nclass Helper {}\n",
      [`${root}/app/Unused.java`]: "package com.acme.app;\nclass Unused {}\n",
      [`${root}/store/Repo.java`]: "package com.acme.store;\npublic class Repo { public static class Entry {} }\n",
      [`${root}/util/Strings.java`]: "package com.acme.util;\npublic class Strings { public static String trim(String s) { return s; } }\n",
      [`${root}/api/Controller.java`]: "package com.acme.api;\npublic class Controller {}\n",
      [`${root}/api/Dto.java`]: "package com.acme.api;\npublic class Dto {}\n",
    });
    expect(found.get(`${root}/app/Main.java`)).toEqual([`${root}/api/Controller.java`, `${root}/api/Dto.java`, `${root}/app/Helper.java`, `${root}/store/Repo.java`, `${root}/util/Strings.java`]);
  });

  test("TypeScript and JavaScript: relative imports, re-exports, require, dynamic imports, index files, .js names for .ts files, and tsconfig paths and baseUrl", () => {
    const found = links({
      "tsconfig.json": '{\n  // the app\n  "compilerOptions": { "baseUrl": "src", "paths": { "@lib/*": ["lib/*"], }, },\n}\n',
      "src/app.ts": [
        'import { a } from "./util";',
        'import type { T } from "@lib/types";',
        'import { b } from "./b.js";',
        'import {\n  c,\n  d,\n} from "./multi";',
        'export * from "./re";',
        'export { e } from "./re2";',
        'const legacy = require("./legacy.js");',
        'const lazy = () => import("./lazy");',
        'import config from "core/config";',
        'import React from "react";',
        'import "./side-effect";',
      ].join("\n"),
      "src/util/index.ts": "export const a = 1;\n",
      "src/lib/types.ts": "export type T = 1;\n",
      "src/b.ts": "export const b = 1;\n",
      "src/multi.ts": "export const c = 1, d = 2;\n",
      "src/re.ts": "export {};\n",
      "src/re2.ts": "export const e = 1;\n",
      "src/legacy.js": "module.exports = {};\n",
      "src/lazy.tsx": "export default 1;\n",
      "src/core/config.ts": "export default {};\n",
      "src/side-effect.mjs": "export {};\n",
    });
    expect(found.get("src/app.ts")).toEqual(["src/b.ts", "src/core/config.ts", "src/lazy.tsx", "src/legacy.js", "src/lib/types.ts", "src/multi.ts", "src/re.ts", "src/re2.ts", "src/side-effect.mjs", "src/util/index.ts"]);
  });

  test("Python: absolute imports by package and through src/ for a namespace package, relative imports, and parenthesised name lists", () => {
    const found = links({
      "pkg/__init__.py": "",
      "pkg/app.py": [
        "import os",
        "import pkg.db",
        "from pkg import models",
        "from . import views",
        "from .services.mail import send",
        "from ..outside import thing",
        "from pkg.models import (\n    User,\n    Group,\n)",
      ].join("\n"),
      "pkg/db.py": "",
      "pkg/models.py": "class User: pass\nclass Group: pass\n",
      "pkg/views.py": "",
      "pkg/services/__init__.py": "",
      "pkg/services/mail.py": "def send(): pass\n",
      "outside.py": "thing = 1\n",
      "src/tool/cli.py": "from tool.core import run\n",
      "src/tool/core.py": "def run(): pass\n",
    });
    expect(found.get("pkg/app.py")).toEqual(["outside.py", "pkg/db.py", "pkg/models.py", "pkg/services/mail.py", "pkg/views.py"]);
    expect(found.get("src/tool/cli.py")).toEqual(["src/tool/core.py"]);
  });
});

describe("ACC-02 findings", () => {
  const files: Record<string, string> = {
    "src/api/routes.ts": 'import { db } from "../store/db";\n',
    "src/api/handlers.ts": 'import { db } from "../store/db";\nimport { cache } from "../store/cache";\n',
    "src/api/util.ts": 'import { db } from "../store/db";\n',
    "src/store/db.ts": "export const db = 1;\n",
    "src/store/cache.ts": "export const cache = 1;\n",
    "src/ui/app.ts": 'import "../api/routes";\n',
    "src/lone/x.ts": "export const x = 1;\n",
    "src/idle/y.ts": "export const y = 1;\n",
    "src/jobs/job.py": "def run(): pass\n",
  };
  const box = (id: string, path: string) => ({ id, label: id.toUpperCase(), sources: [{ path }] });
  const components = [box("api", "src/api/routes.ts"), box("store", "src/store/db.ts"), box("ui", "src/ui/app.ts"), box("lone", "src/lone/x.ts"), box("idle", "src/idle/y.ts"), box("jobs", "src/jobs/job.py"), box("docs", "README.md")];
  const connections = [
    { id: "ui-api", from: "ui", to: "api", label: "calls" },
    { id: "ui-store", from: "ui", to: "store", label: "reads" },
    { id: "store-ui", from: "store", to: "ui", label: "notifies" },
    { id: "api-lone", from: "api", to: "lone", label: "uses" },
    { id: "lone-ui", from: "lone", to: "ui", label: "WebSocket" },
    { id: "api-jobs", from: "api", to: "jobs", label: "starts" },
    { id: "ui-docs", from: "ui", to: "docs" },
  ];

  test("arrows without an import path within two hops, box pairs with 3 links and no arrow, and boxes with neither are reported; the rest are not checked or pass", () => {
    const findings = checkImports(components, connections, links(files));
    expect(findings.map((finding) => [finding.code, finding.connection ?? finding.component ?? finding.between?.join("+"), finding.links ?? null])).toEqual([
      ["UnsupportedEdge", "api-lone", null],
      ["NotChecked", "lone-ui", null],
      ["NotChecked", "api-jobs", null],
      ["NotChecked", "ui-docs", null],
      ["MissingEdge", "api+store", 4],
      ["Isolated", "idle", null],
    ]);
    expect(findings.find((finding) => finding.code === "UnsupportedEdge")).toMatchObject({ pointer: "/connections/3", message: "No import path joins API and LONE within two hops. Cite where they work together, name the protocol in the label, or remove the arrow." });
    expect(findings.filter((finding) => finding.code === "NotChecked").map((finding) => finding.message)).toEqual([
      "Not checked: the arrow names a protocol, which imports cannot show.",
      "Not checked: the arrow joins code in different languages.",
      "Not checked: one end has no code in Java, TypeScript, JavaScript or Python.",
    ]);
  });

  test("an arrow in the import's own direction or against it, directly or through one box, is backed", () => {
    const findings = checkImports(components, connections.slice(0, 3), links(files));
    expect(findings.filter((finding) => finding.code === "UnsupportedEdge")).toEqual([]);
  });
});
