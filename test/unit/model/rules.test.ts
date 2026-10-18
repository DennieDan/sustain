// ARC-01: each rule kind in each checked language, against the imports, with the importing line.
import { describe, expect, test } from "vitest";
import { importRefs } from "../../../src/model/evidence/graph";
import { checkRules, readRules, type Rule } from "../../../src/model/rules";

/** The same three boxes in each language: the UI imports the API and the store; the API imports the store. */
const REPOS: Record<string, { files: Record<string, string>; ui: string; api: string; store: string; storeLine: number }> = {
  TypeScript: {
    files: {
      "src/ui/app.ts": 'import { call } from "../api/client";\nimport { db } from "../store/db";\nexport const app = call(db);\n',
      "src/api/client.ts": 'import { db } from "../store/db";\nexport const call = (x: unknown) => db;\n',
      "src/store/db.ts": "export const db = {};\n",
    },
    ui: "src/ui/app.ts",
    api: "src/api/client.ts",
    store: "src/store/db.ts",
    storeLine: 2,
  },
  Java: {
    files: {
      "src/main/java/com/x/ui/App.java": "package com.x.ui;\n\nimport com.x.api.Client;\nimport com.x.store.Db;\n\nclass App {}\n",
      "src/main/java/com/x/api/Client.java": "package com.x.api;\n\nimport com.x.store.Db;\n\npublic class Client {}\n",
      "src/main/java/com/x/store/Db.java": "package com.x.store;\n\npublic class Db {}\n",
    },
    ui: "src/main/java/com/x/ui/App.java",
    api: "src/main/java/com/x/api/Client.java",
    store: "src/main/java/com/x/store/Db.java",
    storeLine: 4,
  },
  Python: {
    files: {
      "ui/__init__.py": "",
      "ui/app.py": "import os\nfrom api.client import call\nfrom store import db\n",
      "api/__init__.py": "",
      "api/client.py": "from store.db import save\n",
      "store/__init__.py": "",
      "store/db.py": "def save(): pass\n",
    },
    ui: "ui/app.py",
    api: "api/client.py",
    store: "store/db.py",
    storeLine: 3,
  },
};

function setup(language: string) {
  const repo = REPOS[language]!;
  const components = [
    { id: "ui", sources: [{ path: repo.ui }] },
    { id: "api", sources: [{ path: repo.api }] },
    { id: "store", sources: [{ path: repo.store }] },
  ];
  const refs = importRefs(Object.keys(repo.files).sort(), (path) => repo.files[path] ?? null);
  return { repo, components, refs };
}

const KINDS: Record<string, Rule> = {
  forbid: { id: "ui-not-store", kind: "forbid", from: ["ui"], to: ["store"], reason: "The UI reads data through the API." },
  "only-via": { id: "store-via-api", kind: "only-via", from: ["ui", "api"], to: ["store"], via: ["api"], reason: "Only the API talks to the store." },
  isolated: { id: "store-isolated", kind: "isolated", from: ["store"], to: ["api"], reason: "The store is the API's alone." },
};

describe("ARC-01 each rule kind in each language", () => {
  for (const language of Object.keys(REPOS)) {
    for (const [kind, rule] of Object.entries(KINDS)) {
      test(`${kind} in ${language}: the UI's import of the store breaks it, the API's does not`, () => {
        const { repo, components, refs } = setup(language);
        expect(checkRules([rule], components, refs)).toEqual([{ rule: rule.id, kind, reason: rule.reason, file: repo.ui, line: repo.storeLine, imported: repo.store }]);
      });
    }
  }

  test("a rule end may be a path: glob, and a file that keeps to the rules breaks none", () => {
    const { repo, components, refs } = setup("TypeScript");
    const byPath: Rule = { id: "ui-files", kind: "forbid", from: ["path:src/ui/**"], to: ["path:src/store/*.ts"], reason: "x" };
    expect(checkRules([byPath], components, refs).map((violation) => [violation.file, violation.line, violation.imported])).toEqual([[repo.ui, 2, repo.store]]);
    expect(checkRules([{ ...byPath, from: ["path:src/api/**"], to: ["ui"] }], components, refs)).toEqual([]);
  });

  test("rules are read from the config with what is wrong with each one", () => {
    const { rules, errors } = readRules([
      KINDS["forbid"],
      { id: "x", kind: "only-via", from: "ui", to: "store", reason: "y" },
      { id: "x", kind: "ban", from: [], reason: "", extra: 1 },
    ]);
    expect(rules.map((rule) => rule.id)).toEqual(["ui-not-store"]);
    expect(errors).toEqual([
      'rules[1] needs "via"',
      'rules[2] has unknown key "extra"',
      'rules[2].id "x" is used twice',
      "rules[2].kind must be forbid, only-via, isolated",
      'rules[2].from must be a box id, a "path:" glob, or a list of them',
      "rules[2].reason must say why the rule exists",
    ]);
  });
});
