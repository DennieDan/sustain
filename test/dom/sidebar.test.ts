// UI-01, SET-02, UI-02, CST-04, UI-06: the sidebar renders each state from the HomeState it is sent.
import { beforeEach, describe, expect, test } from "vitest";
import { parseAnswer } from "../../src/model/ask";
import { checkView, type PracticeCheck } from "../../src/model/practice";
import type { HomeState, HomeWebviewMessage, MapItem, RunCard } from "../../src/model/messages";
import type { Check } from "../../src/model/preflight";
import { createHome, phaseLine, type Home } from "../../webview/home";

const NOW = new Date("2026-10-18T12:00:00Z");
const HOSTILE = '<img src=x onerror="alert(1)">';

let posted: HomeWebviewMessage[];
let home: Home;
let container: HTMLElement;

beforeEach(() => {
  posted = [];
  container = document.createElement("div");
  document.body.replaceChildren(container);
  home = createHome(container, (message) => posted.push(message), () => NOW);
});

const OK_CHECKS: Check[] = [
  { id: "node", ok: true, detail: "Node 24.21.0" },
  { id: "claude", ok: true, detail: "2.1.0 (Claude Code)" },
  { id: "git", ok: true, detail: "Git repository" },
];

function state(fields: Partial<HomeState> = {}): HomeState {
  return {
    folders: [{ name: "repo", root: "/r" }],
    root: "/r",
    maps: [],
    composer: { agents: [{ cli: "claude", label: "Claude Code", headless: true }], agent: "claude", runMode: "sidebar", notes: [], confirm: false },
    run: null,
    setup: OK_CHECKS,
    session: null,
    ask: { blocked: null, turns: [], estimate: null, confirm: false },
    review: null,
    practice: { blocked: null, estimate: null, confirm: false, check: null },
    rules: null,
    hotspots: null,
    health: null,
    serverNow: NOW.toISOString(),
    ...fields,
  };
}

function map(fields: Partial<MapItem>): MapItem {
  return { runFolder: "architecture-x-20261016-120000", file: "/r/.archify/architecture-x-20261016-120000/candidate.json", title: "Sustain", focus: "", agent: "Claude Code", createdAt: "2026-10-16T12:00:00Z", boxes: 16, changed: null, ...fields };
}

function run(fields: Partial<RunCard>): RunCard {
  return {
    agent: "Claude Code",
    mode: "sidebar",
    focus: "payments",
    status: "running",
    phase: null,
    attempts: 0,
    runFolder: null,
    feed: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: null,
    estimate: null,
    denials: [],
    startedAt: "2026-10-18T11:58:28Z",
    finishedAt: null,
    ...fields,
  };
}

function text(selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((node) => node.textContent ?? "");
}

function click(label: string): void {
  const target = [...container.querySelectorAll("button")].find((node) => node.textContent === label);
  if (!target) throw new Error(`no button "${label}"`);
  target.click();
}

describe("UI-01 sidebar states", () => {
  test("empty: no map yet, the composer and its notes, and Generate posts the typed focus", () => {
    home.render(state({ composer: { ...state().composer, notes: ["Installs the sustain-architecture skill in ~/.claude/skills/."] } }));
    expect(text(".header__status")).toEqual(["No map yet"]);
    expect(text(".composer__note")).toEqual(["Installs the sustain-architecture skill in ~/.claude/skills/."]);
    expect(container.querySelector(".maps")).toBeNull();
    container.querySelector<HTMLTextAreaElement>(".composer__focus")!.value = "payment flow";
    click("Generate");
    expect(posted).toEqual([{ type: "generate", focus: "payment flow" }]);
  });

  test("the focus text survives a new state", () => {
    home.render(state());
    container.querySelector<HTMLTextAreaElement>(".composer__focus")!.value = "half typed";
    home.render(state({ maps: [map({})] }));
    expect(container.querySelector<HTMLTextAreaElement>(".composer__focus")!.value).toBe("half typed");
  });

  test("maps: newest first with focus, agent, age and boxes; Open, Refresh and Delete post the file", () => {
    home.render(state({ maps: [map({ focus: "payments" }), map({ title: null, runFolder: "architecture-old-20261001-090000", file: "/r/old.json", agent: null, boxes: 1, createdAt: "2026-10-01T09:00:00Z" })] }));
    expect(text(".header__status")).toEqual(["Map from 2 days ago · 16 boxes"]);
    expect(text(".map__title")).toEqual(["Sustain", "architecture-old-20261001-090000"]);
    expect(text(".map__meta")).toEqual(["payments · Claude Code · 2 days ago · 16 boxes", "17 days ago · 1 box"]);
    click("Delete");
    container.querySelector<HTMLButtonElement>(".map__title")!.click();
    click("Refresh");
    expect(posted).toEqual([
      { type: "deleteMap", file: map({}).file },
      { type: "openMap", file: map({}).file },
      { type: "refreshMap", file: map({}).file },
    ]);
  });

  test("running: the card shows feed, figures and Cancel, and Generate is disabled", () => {
    const feed = [
      { kind: "command" as const, text: "Creating the run folder" },
      { kind: "read" as const, text: "Reading src/extension/panel.ts" },
      { kind: "validate" as const, text: "Validating the draft" },
    ];
    home.render(state({ run: run({ feed, phase: "validating", attempts: 2, usage: { input: 2000, output: 150, cacheRead: 4000, cacheWrite: 0 } }) }));
    expect(text(".run__status")).toEqual(["Running"]);
    expect(text(".run__phase")).toEqual(["Validating, attempt 2"]);
    expect(text(".run__figures")).toEqual(["1:32 · 6k in · 150 out"]);
    expect(text(".feed")).toEqual(feed.map((item) => item.text));
    expect(container.querySelector<HTMLButtonElement>(".composer__generate")!.disabled).toBe(true);
    click("Cancel");
    expect(posted).toEqual([{ type: "cancelRun" }]);
  });

  test("setup failing: the checklist opens, with one fix per failing check", () => {
    home.render(state({ setup: OK_CHECKS }));
    expect(container.querySelector<HTMLDetailsElement>(".setup")!.open).toBe(false);
    expect(text(".setup > summary")).toEqual(["Setup · ready"]);
    const failing: Check[] = [
      ...OK_CHECKS,
      { id: "codex", ok: false, detail: "codex was not found", fix: { kind: "copy", label: "Copy install command", text: "npm install -g @openai/codex" } },
      { id: "skills", ok: false, detail: "Sustain's skills are missing or changed", fix: { kind: "install-skills", label: "Install skills" } },
    ];
    home.render(state({ setup: failing }));
    expect(container.querySelector<HTMLDetailsElement>(".setup")!.open).toBe(true);
    expect(text(".setup > summary")).toEqual(["Setup · needs attention"]);
    expect(text(".check--fail .check__detail")).toEqual(["codex was not found", "Sustain's skills are missing or changed"]);
    click("Install skills");
    expect(posted).toEqual([{ type: "fix", check: "skills" }]);
  });

  test("setup while checking says so", () => {
    home.render(state({ setup: null }));
    expect(text(".setup > summary")).toEqual(["Setup · checking…"]);
  });

  test("session active: phase, step and score with Open session; otherwise Start", () => {
    home.render(state());
    click("Start learning session");
    home.render(state({ session: { phase: "hunting", stepIndex: 1, stepsTotal: 4, score: 30 } }));
    expect(text(".learning__status")).toEqual(["Hunting · Step 2 of 4 · Score 30"]);
    click("Open session");
    expect(posted).toEqual([{ type: "startLearning" }, { type: "openSession" }]);
  });

  test("several folders show a picker, and no folder asks for one", () => {
    home.render(state({ folders: [{ name: "alpha", root: "/a" }, { name: "beta", root: "/b" }], root: "/b" }));
    const picker = container.querySelector<HTMLSelectElement>("select.header__folder")!;
    expect(picker.value).toBe("/b");
    picker.value = "/a";
    picker.dispatchEvent(new Event("change"));
    expect(posted).toEqual([{ type: "pickFolder", root: "/a" }]);
    home.render(state({ folders: [], root: null, session: null }));
    expect(text(".header__empty")).toEqual(["Open a folder to map it."]);
    expect(container.querySelector<HTMLButtonElement>(".composer__generate")!.disabled).toBe(true);
  });

  test("the agent and run mode post their changes", () => {
    home.render(state({ composer: { ...state().composer, agents: [{ cli: "claude", label: "Claude Code", headless: true }, { cli: "codex", label: "Codex", headless: true }] } }));
    const agent = container.querySelector<HTMLSelectElement>(".composer__agent")!;
    agent.value = "codex";
    agent.dispatchEvent(new Event("change"));
    click("In terminal");
    expect(posted).toEqual([
      { type: "setAgent", agent: "codex" },
      { type: "setRunMode", runMode: "terminal" },
    ]);
  });
});

describe("CST-03 cost before every run", () => {
  const ESTIMATE = "About 180k–260k tokens (about $0.50–$0.80 at API prices; on a subscription it uses part of your plan's limit)";
  const generate = (): HTMLButtonElement => container.querySelector<HTMLButtonElement>(".composer__generate")!;

  test("the estimate shows under Generate, and one click generates below the threshold", () => {
    home.render(state({ composer: { ...state().composer, notes: [ESTIMATE] } }));
    expect(text(".composer__note")).toEqual([ESTIMATE]);
    container.querySelector<HTMLTextAreaElement>(".composer__focus")!.value = "payments";
    generate().click();
    expect(posted).toEqual([{ type: "generate", focus: "payments" }]);
  });

  test("above the threshold the first click asks for a second, which sends the run as confirmed", () => {
    home.render(state({ composer: { ...state().composer, notes: [ESTIMATE], confirm: true } }));
    generate().click();
    expect(posted).toEqual([]);
    expect(generate().textContent).toBe("Click again to generate");
    home.render(state({ composer: { ...state().composer, notes: [ESTIMATE], confirm: true } }));
    expect(generate().textContent).toBe("Click again to generate");
    generate().click();
    expect(posted).toEqual([{ type: "generate", focus: "", confirmed: true }]);
    expect(generate().textContent).toBe("Generate");
  });

  test("the run card keeps the estimate it was started with", () => {
    home.render(state({ run: run({ estimate: ESTIMATE }) }));
    expect(text(".run__estimate")).toEqual([ESTIMATE]);
    home.render(state({ run: run({}) }));
    expect(text(".run__estimate")).toEqual([]);
  });

  test("Ask shows what a question costs, and above the threshold asks for a second click", () => {
    const ask = { blocked: null, turns: [], estimate: "About 30k–60k tokens (about $0.10–$0.20 at API prices; on a subscription it uses part of your plan's limit)", confirm: true };
    home.render(state({ ask }));
    expect(text(".ask__estimate")).toEqual([ask.estimate]);
    container.querySelector<HTMLTextAreaElement>(".ask__question")!.value = "Where are payments retried?";
    click("Ask");
    expect(posted).toEqual([]);
    click("Click again to ask");
    expect(posted).toEqual([{ type: "ask", question: "Where are payments retried?", confirmed: true }]);
  });
});

describe("UI-02 run card outcomes", () => {
  test("a finished run shows tokens and cost and no Cancel", () => {
    home.render(state({ run: run({ status: "done", phase: "accepted", attempts: 2, usage: { input: 8300, output: 1190, cacheRead: 15000, cacheWrite: 500 }, costUsd: 0.4123, finishedAt: "2026-10-18T11:59:59Z" }) }));
    expect(text(".run__status")).toEqual(["Done"]);
    expect(text(".run__phase")).toEqual(["Accepted on attempt 2"]);
    expect(text(".run__figures")).toEqual(["1:31 · 24k in · 1.2k out · $0.41"]);
    expect(text("button")).not.toContain("Cancel");
  });

  test("a denial offers the terminal", () => {
    home.render(state({ run: run({ status: "done", denials: ["Bash: rm -rf build"] }) }));
    expect(text(".run__denial-list li")).toEqual(["Bash: rm -rf build"]);
    click("Run in terminal instead");
    expect(posted).toEqual([{ type: "runInTerminal" }]);
  });

  test("agent text in the feed and denials renders as text", () => {
    home.render(state({ run: run({ focus: HOSTILE, feed: [{ kind: "message", text: HOSTILE }], denials: [HOSTILE] }) }));
    expect(container.querySelector("img")).toBeNull();
    expect(text(".feed")).toEqual([HOSTILE]);
  });
});

describe("CST-04 terminal-mode card", () => {
  test("run.json's phases read as progress", () => {
    expect(phaseLine(run({ phase: null }))).toBeNull();
    expect(phaseLine(run({ phase: "created" }))).toBe("Run folder created");
    expect(phaseLine(run({ phase: "validating", attempts: 1 }))).toBe("Validating, attempt 1");
    expect(phaseLine(run({ phase: "rejected", attempts: 1 }))).toBe("Rejected on attempt 1, repairing");
    expect(phaseLine(run({ phase: "accepted", attempts: 1 }))).toBe("Accepted");
    home.render(state({ run: run({ mode: "terminal", phase: "rejected", attempts: 1 }) }));
    expect(text(".run__agent")).toEqual(["Claude Code in a terminal"]);
    expect(text(".run__phase")).toEqual(["Rejected on attempt 1, repairing"]);
  });
});

describe("UI-06 Ask", () => {
  const turn = {
    question: "Where does Cancel go?",
    agent: "Claude Code",
    status: "done" as const,
    blocks: parseAnswer("It kills the group in src/extension/runner.ts:31."),
    usage: { input: 3000, output: 200, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.02,
    error: null,
  };

  test("history shows each question, its answer and figures; Ask posts the question and clears the box", () => {
    home.render(state({ ask: { estimate: null, confirm: false, blocked: null, turns: [turn] } }));
    expect(text(".turn__question")).toEqual(["Where does Cancel go?"]);
    expect(text(".answer .cite")).toEqual(["src/extension/runner.ts:31"]);
    expect(text(".turn__figures")).toEqual(["Claude Code · 3k in · 200 out · $0.02"]);
    const box = container.querySelector<HTMLTextAreaElement>(".ask__question")!;
    box.value = "And the terminal?";
    click("Ask");
    expect(posted).toEqual([{ type: "ask", question: "And the terminal?" }]);
    expect(box.value).toBe("");
    click("Clear");
    expect(posted.at(-1)).toEqual({ type: "clearAsk" });
  });

  test("while an answer streams, Ask is disabled and Stop shows", () => {
    home.render(state({ ask: { estimate: null, confirm: false, blocked: null, turns: [{ ...turn, status: "running", blocks: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: null }] } }));
    expect(text(".turn__pending")).toEqual(["Claude Code is reading the map…"]);
    const ask = [...container.querySelectorAll("button")].find((node) => node.textContent === "Ask")!;
    expect(ask.disabled).toBe(true);
    const stop = [...container.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === "Stop")!;
    expect(stop.hidden).toBe(false);
    stop.click();
    expect(posted).toEqual([{ type: "cancelAsk" }]);
  });

  test("a blocked Ask says why and disables the box", () => {
    home.render(state({ ask: { estimate: null, confirm: false, blocked: "Generate a map first. Ask uses it as the guide.", turns: [] } }));
    expect(text(".ask__note")).toEqual(["Generate a map first. Ask uses it as the guide."]);
    expect(container.querySelector<HTMLTextAreaElement>(".ask__question")!.disabled).toBe(true);
  });

  test("a failed answer shows its error", () => {
    home.render(state({ ask: { estimate: null, confirm: false, blocked: null, turns: [{ ...turn, status: "failed", blocks: [], error: "Not logged in" }] } }));
    expect(text(".turn__error")).toEqual(["Not logged in"]);
  });
});

describe("ARC-02 Rules", () => {
  test("each rule shows its violations and reason, broken rules stand out, and Suggest rules asks the host", () => {
    home.render(state({ maps: [map({})], rules: { map: "architecture-x-20261016-120000", rules: [{ id: "api-not-store", reason: "Through the repository.", violations: 2 }, { id: "ui-not-db", reason: "Never.", violations: 0 }] } }));
    expect(text(".rule__id")).toEqual(["api-not-store · 2 violations", "ui-not-db · 0 violations"]);
    expect(text(".rule__reason")).toEqual(["Through the repository.", "Never."]);
    expect([...container.querySelectorAll(".rule")].map((rule) => rule.classList.contains("rule--broken"))).toEqual([true, false]);
    click("Suggest rules");
    expect(posted).toEqual([{ type: "suggestRules" }]);
  });

  test("without rules it says how to add one, and without a map the section is left out", () => {
    home.render(state({ maps: [map({})], rules: { map: null, rules: [] } }));
    expect(text(".rules__empty")).toEqual(["No rules yet. Suggest some, or right-click an arrow or a box on the map."]);
    home.render(state({ maps: [], rules: { map: null, rules: [] } }));
    expect(container.querySelector(".rules")).toBeNull();
  });
});

describe("ARC-03 Hotspots", () => {
  test("the five most changed boxes with their commits and lines, or a line saying none changed", () => {
    home.render(state({ maps: [map({})], hotspots: { days: 90, boxes: [{ id: "api", label: "API", commits: 9, lines: 120 }, { id: "db", label: "DB", commits: 1, lines: 1 }] } }));
    expect(text(".hotspots__window")).toEqual(["Most changed in the last 90 days"]);
    expect(text(".hotspot")).toEqual(["API · 9 commits · 120 lines", "DB · 1 commit · 1 line"]);
    home.render(state({ maps: [map({})], hotspots: { days: 30, boxes: [] } }));
    expect(text(".hotspots__empty")).toEqual(["No box's code changed in that time."]);
  });
});

describe("ARC-05 Health", () => {
  test("each line shows, the ones that need a look stand out, and a click opens its view", () => {
    home.render(state({
      maps: [map({})],
      health: [
        { kind: "freshness", text: "3 of 16 boxes changed since the map.", attention: true },
        { kind: "uncovered", text: "Every changed line since the map is in a box.", attention: false },
        { kind: "violations", text: "1 import breaks a rule.", attention: true },
        { kind: "hotspot", text: "API changed most, with 9 commits in the last 90 days.", attention: false },
      ],
    }));
    expect(text(".health__open")).toEqual(["3 of 16 boxes changed since the map.", "Every changed line since the map is in a box.", "1 import breaks a rule.", "API changed most, with 9 commits in the last 90 days."]);
    expect([...container.querySelectorAll(".health__item")].map((item) => item.classList.contains("health__item--attention"))).toEqual([true, false, true, false]);
    for (const label of ["3 of 16 boxes changed since the map.", "Every changed line since the map is in a box.", "1 import breaks a rule.", "API changed most, with 9 commits in the last 90 days."]) click(label);
    expect(posted).toEqual(["freshness", "uncovered", "violations", "hotspot"].map((item) => ({ type: "openHealth", item })));
    home.render(state({ maps: [map({})], health: null }));
    expect(container.querySelector(".health")).toBeNull();
  });
});

describe("PRC-02 Review changes", () => {
  const review = {
    scope: "This branch",
    error: null,
    counts: { touched: 2, stale: 1, gone: 0, uncovered: 4, candidates: 1, arrows: 0 },
    candidates: [{ dir: "src/payments", label: "payments", lines: 240, files: ["src/payments/a.ts", "src/payments/b.ts", "src/payments/c.ts"] }],
    branchMap: null,
    canUpdate: true,
  };

  test("the section shows the counts and each candidate's actions", () => {
    home.render(state({ maps: [map({})], review }));
    expect(text(".review__counts")).toEqual(["This branch: 2 touched · 1 stale · 0 gone · 4 not on the map · 1 new box candidate"]);
    expect(text(".candidate__dir")).toEqual(["src/payments/"]);
    for (const label of ["Review changes…", "Show files", "Add to map", "Ignore"]) click(label);
    expect(posted).toEqual([
      { type: "review" },
      { type: "showFiles", dir: "src/payments" },
      { type: "addToMap", dir: "src/payments" },
      { type: "ignoreCandidate", dir: "src/payments" },
    ]);
  });

  test("an error is shown, and a folder without maps has no section", () => {
    home.render(state({ maps: [map({})], review: { scope: "", error: "No common commit", counts: null, candidates: [], branchMap: null, canUpdate: false } }));
    expect(text(".review__error")).toEqual(["No common commit"]);
    home.render(state({ maps: [] }));
    expect(container.querySelector(".review")).toBeNull();
  });
});

describe("SKL-01 Practice", () => {
  const question = (n: number): PracticeCheck["questions"][number] => ({
    question: `Why does step ${n} retry?`,
    key: `EXPECTED-ANSWER-${n}`,
    citation: { path: "src/pay.ts", line: n, endLine: null },
    answer: null,
    status: "open",
    grade: null,
    error: null,
  });
  const check = (questions: PracticeCheck["questions"]): PracticeCheck => ({ root: "/r", scope: "This branch's changes", agent: "Claude Code", status: "done", error: null, startedAt: NOW.toISOString(), questions });

  test("the questions show with an answer box each, no expected answer reaches the DOM, and Answer posts the typed answer", () => {
    const view = checkView(check([question(1), question(2), question(3)]), () => true);
    home.render(state({ practice: { blocked: null, estimate: null, confirm: false, check: view } }));
    expect(text(".practice-question__text")).toEqual(["Why does step 1 retry?", "Why does step 2 retry?", "Why does step 3 retry?"]);
    expect(JSON.stringify(view)).not.toContain("EXPECTED-ANSWER");
    expect(container.innerHTML).not.toContain("EXPECTED-ANSWER");
    const box = container.querySelectorAll<HTMLTextAreaElement>(".practice-question__answer")[1]!;
    box.value = "It retries on timeouts.";
    box.dispatchEvent(new Event("input"));
    home.render(state({ practice: { blocked: null, estimate: null, confirm: false, check: view }, maps: [map({})] }));
    expect(container.querySelectorAll<HTMLTextAreaElement>(".practice-question__answer")[1]!.value).toBe("It retries on timeouts.");
    container.querySelectorAll<HTMLButtonElement>(".practice-question__send")[1]!.click();
    expect(posted).toEqual([{ type: "practiceAnswer", index: 1, answer: "It retries on timeouts." }]);
  });

  test("a graded answer shows its grade, its reason and a link to the cited line, which only a citable file gets", () => {
    const graded = { ...question(1), answer: "On timeouts.", status: "graded" as const, grade: { grade: "partial" as const, reason: "It misses the limit of two.", citation: { path: "src/pay.ts", line: 5, endLine: null } } };
    home.render(state({ practice: { blocked: null, estimate: null, confirm: false, check: checkView(check([graded, { ...graded, grade: { ...graded.grade, citation: { path: ".env", line: 1, endLine: null } } }, question(3)]), (path) => path !== ".env") } }));
    expect(text(".practice-grade__label")).toEqual(["Partial", "Partial"]);
    expect(text(".practice-grade__reason")).toEqual(["It misses the limit of two.", "It misses the limit of two."]);
    expect(text(".practice-grade .cite")).toEqual(["src/pay.ts:5"]);
    click("src/pay.ts:5");
    expect(posted).toEqual([{ type: "openCitation", path: "src/pay.ts", line: 5, endLine: null }]);
  });

  test("each scope starts a check, and above the threshold the first click asks for a second", () => {
    home.render(state({ practice: { blocked: null, estimate: "About 30k–60k tokens", confirm: false, check: null } }));
    expect(text(".practice__estimate")).toEqual(["About 30k–60k tokens"]);
    for (const label of ["This branch", "Uncommitted changes", "A box…"]) click(label);
    expect(posted).toEqual([
      { type: "practiceStart", scope: "branch" },
      { type: "practiceStart", scope: "uncommitted" },
      { type: "practiceStart", scope: "box" },
    ]);
    posted.length = 0;
    home.render(state({ practice: { blocked: null, estimate: "About 30k–60k tokens", confirm: true, check: null } }));
    click("This branch");
    expect(posted).toEqual([]);
    click("Click again to start");
    expect(posted).toEqual([{ type: "practiceStart", scope: "branch", confirmed: true }]);
  });

  test("while the questions are written, the scopes are disabled and Stop shows; a blocked section says why", () => {
    home.render(state({ practice: { blocked: null, estimate: null, confirm: false, check: { ...checkView(check([]), () => true), status: "running" } } }));
    expect([...container.querySelectorAll<HTMLButtonElement>(".practice__scopes button")].map((node) => node.disabled)).toEqual([true, true, true]);
    click("Stop");
    expect(posted).toEqual([{ type: "practiceCancel" }]);
    home.render(state({ practice: { blocked: "Explain-back needs Claude Code or Codex on PATH.", estimate: null, confirm: false, check: null } }));
    expect(text(".practice__note")).toEqual(["Explain-back needs Claude Code or Codex on PATH."]);
  });
});
