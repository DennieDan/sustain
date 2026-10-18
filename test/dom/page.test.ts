// RCH-01: the generated page has exactly one executable script whatever the labels say, and its
// script draws the map offline and copies a clicked citation.
import { describe, expect, test, vi } from "vitest";
import type { PageData } from "../../src/model/page";
import { escapeJson, renderPage } from "../../src/model/page";

// VWR-02: pages lay out in Web Workers, which happy-dom lacks; here ELK runs in the thread instead.
vi.mock("../../webview/layoutWorkers", async () => {
  const { runInThread } = await import("../../src/layout/elkInThread");
  return { workerRunner: () => runInThread };
});

const HOSTILE = "</script><img src=x onerror=alert(1)>";
const DOC = {
  meta: { title: "Shop" },
  components: [
    { id: "api", type: "backend", label: HOSTILE, sources: [{ path: "src/api.ts", line: 3, end_line: 9 }] },
    { id: "db", type: "database", label: "Orders", sources: [{ path: ".env", line: 1 }] },
  ],
  connections: [{ from: "api", to: "db" }],
};
const DATA: PageData = { title: "Shop", doc: DOC, root: null, project: null, repository: null };

const { written } = vi.hoisted(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  const context = { font: "", measureText: (text: string) => ({ width: text.length * 7 }) };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", { value: { writeText: (text: string) => (written.push(text), Promise.resolve()) }, configurable: true });
  return { written };
});

describe("RCH-01 diagram page", () => {
  test("a hostile label yields exactly one executable script", () => {
    const html = renderPage(DATA, { script: "void 0", style: "" });
    const page = new DOMParser().parseFromString(html, "text/html");
    const executable = [...page.querySelectorAll("script")].filter((script) => script.type === "" || /javascript|module/.test(script.type));
    expect(executable).toHaveLength(1);
    expect(page.querySelector("img")).toBeNull();
    const data = JSON.parse(page.getElementById("sustain-data")!.textContent!) as PageData;
    expect((data.doc as typeof DOC).components[0]!.label).toBe(HOSTILE);
  });

  test("RCH-01 VWR-02 the page script draws the map offline and copies a clicked citation", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const store = document.createElement("script");
    store.type = "application/json";
    store.id = "sustain-data";
    store.textContent = escapeJson(JSON.stringify(DATA));
    document.body.append(store);
    await import("../../webview/page");

    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2), { timeout: 5000 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect([...document.querySelectorAll<HTMLOptionElement>(".open option")].map((option) => option.value)).toEqual(["copy"]);

    const box = document.querySelector('.node[data-id="api"]')!;
    box.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: 5, clientY: 5 }));
    box.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1, clientX: 5, clientY: 5 }));
    await vi.waitFor(() => expect(written).toEqual(["src/api.ts:3-9"]));

    const denied = document.querySelector('.node[data-id="db"]')!;
    denied.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 2, clientX: 5, clientY: 5 }));
    denied.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 2, clientX: 5, clientY: 5 }));
    expect(document.querySelector(".open__note")!.textContent).toBe("This citation cannot be opened here.");
    expect(written).toEqual(["src/api.ts:3-9"]);
  });
});
