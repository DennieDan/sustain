// SAF-07 and UI-01: the extension manifest keeps Sustain off in untrusted workspaces, and puts
// every command somewhere other than the Command Palette.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { SIDEBAR_ACTIONS } from "../../src/model/home";
import { repoRoot } from "./support/sourceScan";

test("SAF-07 Sustain declares no support for untrusted workspaces", () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { capabilities?: { untrustedWorkspaces?: { supported?: unknown } } };
  expect(manifest.capabilities?.untrustedWorkspaces?.supported).toBe(false);
});

interface Manifest {
  contributes: {
    commands: { command: string; icon?: string }[];
    viewsContainers: { activitybar: { id: string; icon: string }[] };
    views: Record<string, { type?: string; id: string }[]>;
    menus: Record<string, { command: string; when?: string; group?: string }[]>;
    configuration: { properties: Record<string, { default?: unknown; enum?: unknown[] }> };
  };
}

const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as Manifest;

test("UI-01 the Activity Bar container holds the sidebar webview, with a monochrome icon that ships", () => {
  const container = manifest.contributes.viewsContainers.activitybar.find((entry) => entry.id === "sustain");
  expect(container?.icon).toBe("media/sustain.svg");
  expect(manifest.contributes.views["sustain"]).toEqual([{ type: "webview", id: "sustain.home", name: "Sustain" }]);
  const icon = readFileSync(join(repoRoot, "media/sustain.svg"), "utf8");
  expect(icon).toContain('stroke="currentColor"');
  expect(icon).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  expect(readFileSync(join(repoRoot, ".vscodeignore"), "utf8").split("\n")).toContain("!media/**");
});

test("UI-01 every command is reachable from a menu, a title bar or the sidebar", () => {
  const inMenus = new Set(
    Object.entries(manifest.contributes.menus)
      .filter(([menu]) => menu !== "commandPalette")
      .flatMap(([, entries]) => entries.map((entry) => entry.command)),
  );
  const inSidebar = new Set(Object.values(SIDEBAR_ACTIONS));
  const unreachable = manifest.contributes.commands.map((entry) => entry.command).filter((command) => !inMenus.has(command) && !inSidebar.has(command));
  expect(unreachable).toEqual([]);
});

test("UI-01 each sidebar action is a button the sidebar renders", () => {
  const sidebar = readFileSync(join(repoRoot, "webview/home.ts"), "utf8");
  for (const type of Object.keys(SIDEBAR_ACTIONS)) expect(sidebar).toContain(`type: "${type}"`);
});

test("UI-01 the sidebar title bar has Refresh and Check Setup, and runs default to the sidebar", () => {
  const title = manifest.contributes.menus["view/title"]!.filter((entry) => entry.when?.startsWith("view == sustain.home") && entry.group?.startsWith("navigation"));
  expect(title.map((entry) => entry.command)).toEqual(expect.arrayContaining(["sustain.refreshHome", "sustain.checkSetup"]));
  expect(manifest.contributes.configuration.properties["sustain.runMode"]).toMatchObject({ default: "sidebar", enum: ["sidebar", "terminal"] });
});

test("UI-03 Show in Map sits in every file editor's title bar with the Sustain icon, and not on the map", () => {
  expect(manifest.contributes.menus["editor/title"]).toContainEqual({ command: "sustain.showInMap", when: "resourceScheme == file", group: "navigation@100" });
  const command = manifest.contributes.commands.find((entry) => entry.command === "sustain.showInMap") as { icon?: { light: string; dark: string } };
  expect(command.icon).toEqual({ light: "media/sustain-light.svg", dark: "media/sustain-dark.svg" });
  for (const path of Object.values(command.icon!)) expect(readFileSync(join(repoRoot, path), "utf8")).toContain("<svg");
});

test("UI-05 the Explorer maps folders and shows files; boxes open their code", () => {
  expect(manifest.contributes.menus["explorer/context"]).toEqual([
    { command: "sustain.mapFolder", when: "explorerResourceIsFolder", group: "sustain@1" },
    { command: "sustain.showFileInMap", when: "!explorerResourceIsFolder", group: "sustain@2" },
  ]);
  expect(manifest.contributes.menus["webview/context"]).toContainEqual({ command: "sustain.openBoxCode", when: "webviewId == 'sustain.architecture' && webviewSection == 'box'", group: "navigation@1" });
  const hidden = manifest.contributes.menus["commandPalette"]!.filter((entry) => entry.when === "false").map((entry) => entry.command);
  expect(hidden).toEqual(expect.arrayContaining(["sustain.showFileInMap", "sustain.mapFolder", "sustain.openBoxCode"]));
});

test("FRS-04 Show Changes sits in the map panel's title bar only", () => {
  expect(manifest.contributes.menus["editor/title"]).toContainEqual({ command: "sustain.showChanges", when: "activeWebviewPanelId == 'sustain.architecture'", group: "navigation@2" });
});

test("FRS-06 Refresh sits in the map's title bar and in a box's menu", () => {
  expect(manifest.contributes.menus["editor/title"]).toContainEqual({ command: "sustain.refreshArchitecture", when: "activeWebviewPanelId == 'sustain.architecture'", group: "navigation@1" });
  expect(manifest.contributes.menus["webview/context"]).toContainEqual({ command: "sustain.refreshBox", when: "webviewId == 'sustain.architecture' && webviewSection == 'box'", group: "navigation@2" });
});
