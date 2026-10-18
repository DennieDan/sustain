// UI-06: answers render as plain DOM; citations and box names are buttons that ask the host.
import { expect, test } from "vitest";
import { parseAnswer } from "../../src/model/ask";
import type { HomeWebviewMessage } from "../../src/model/messages";
import { renderAnswer } from "../../webview/answer";

const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>';

test("UI-06 paragraphs, lists, inline and fenced code render as their elements", () => {
  const answer = renderAnswer(parseAnswer("Intro with `code`.\n\n- a\n- b\n\n1. one\n\n```\nfn()\n```"), () => undefined);
  expect([...answer.children].map((child) => child.tagName)).toEqual(["P", "UL", "OL", "PRE"]);
  expect(answer.querySelector("p code")?.textContent).toBe("code");
  expect([...answer.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["a", "b"]);
  expect(answer.querySelector("pre code")?.textContent).toBe("fn()");
});

test("UI-06 hostile markup in any block stays text", () => {
  const answer = renderAnswer(parseAnswer(`${HOSTILE}\n\n- ${HOSTILE}\n\n\`${HOSTILE}\`\n\n\`\`\`\n${HOSTILE}\n\`\`\``), () => undefined);
  expect(answer.querySelectorAll("img, script, a").length).toBe(0);
  const tags = new Set([...answer.querySelectorAll("*")].map((node) => node.tagName));
  expect([...tags].sort()).toEqual(["CODE", "LI", "P", "PRE", "UL"]);
  expect(answer.textContent).toContain(HOSTILE);
});

test("UI-06 a citation opens its line and a box name focuses the box", () => {
  const posted: HomeWebviewMessage[] = [];
  const answer = renderAnswer(parseAnswer("The Runner starts it in src/extension/runner.ts:51-70.", [{ id: "runner", label: "Runner" }]), (message) => posted.push(message));
  answer.querySelector<HTMLButtonElement>(".box-link")!.click();
  answer.querySelector<HTMLButtonElement>(".cite")!.click();
  expect(posted).toEqual([
    { type: "focusBox", id: "runner" },
    { type: "openCitation", path: "src/extension/runner.ts", line: 51, endLine: 70 },
  ]);
});
