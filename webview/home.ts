// The Sustain sidebar's DOM (UI-01): header, composer, run card, maps, setup and learning
// session. Built from the HomeState the host sends; every string goes in as text. The composer's
// text box persists across states, so typing survives updates.
import { mapStatus, relativeAge, runFigures, tokenCount } from "../src/model/home";
import type { AskTurn, AskView, HomeState, HomeWebviewMessage, MapItem, PracticeQuestionView, PracticeView, ReviewView, RunCard } from "../src/model/messages";
import type { Grade } from "../src/model/practice";
import type { Check } from "../src/model/preflight";
import { renderAnswer, spanNode } from "./answer";

export type Post = (message: HomeWebviewMessage) => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function section(title: string, className: string): HTMLElement {
  const node = el("section", `section ${className}`);
  node.append(el("h2", "section__title", title));
  return node;
}

const STATUS_LABEL: Record<RunCard["status"], string> = { running: "Running", done: "Done", failed: "Failed", cancelled: "Cancelled" };
/** The Generate button once a run above `sustain.confirmAboveTokens` needs a second click (CST-03). */
const SECOND_CLICK = "Click again to generate";

/** SKL-01: the explain-back's scopes and what their buttons say. */
const PRACTICE_SCOPES = [
  ["branch", "This branch"],
  ["uncommitted", "Uncommitted changes"],
  ["box", "A box…"],
] as const;
const GRADE_LABEL: Record<Grade, string> = { correct: "Correct", partial: "Partial", wrong: "Wrong" };

/** "Validating, attempt 2" and the like, from run.json's phase. */
export function phaseLine(run: RunCard): string | null {
  switch (run.phase) {
    case null:
      return null;
    case "created":
      return "Run folder created";
    case "validating":
      return `Validating, attempt ${run.attempts}`;
    case "rejected":
      return `Rejected on attempt ${run.attempts}, repairing`;
    case "accepted":
      return run.attempts > 1 ? `Accepted on attempt ${run.attempts}` : "Accepted";
  }
}

export interface Home {
  render(state: HomeState): void;
  /** Updates the running card's clock. */
  tick(): void;
}

/** Builds the sidebar in `container`. `now` gives the host's clock. */
export function createHome(container: HTMLElement, post: Post, now: () => Date = () => new Date()): Home {
  const header = el("header", "header");
  const composer = el("section", "section composer");
  const focus = el("textarea", "composer__focus");
  focus.rows = 2;
  focus.placeholder = "What should the map focus on? (optional)";
  focus.setAttribute("aria-label", "Focus");
  const controls = el("div", "composer__controls");
  // CST-03: above the threshold the first click arms the button and the second sends the run.
  let generateArmed = false;
  const generate = button("Generate", "button button--primary composer__generate", () => {
    const confirm = current?.composer.confirm === true;
    if (confirm && !generateArmed) {
      generateArmed = true;
      generate.textContent = SECOND_CLICK;
      return;
    }
    generateArmed = false;
    generate.textContent = "Generate";
    post({ type: "generate", focus: focus.value, ...(confirm ? { confirmed: true } : {}) });
  });
  const notes = el("div", "composer__notes");
  // RCH-04: the same prompt, for an agent Sustain does not launch.
  const copyPrompt = button("Copy prompt for…", "link composer__copy", () => post({ type: "copyPromptFor", focus: focus.value }));
  composer.append(focus, controls, generate, copyPrompt, notes);
  focus.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !generate.disabled) generate.click();
  });
  const runSlot = el("div", "run-slot");
  const maps = el("div", "maps-slot");
  const reviewSlot = el("div", "review-slot");
  const rulesSlot = el("div", "rules-slot");
  const hotspotsSlot = el("div", "hotspots-slot");
  const healthSlot = el("div", "health-slot");
  const setup = el("details", "section setup");
  const session = el("div", "session-slot");
  // SKL-01: rebuilt only when the practice view changes, so an answer being typed keeps its box.
  const practiceSlot = el("div", "practice-slot");
  let practiceKey = "";
  let practiceArmed: string | null = null;
  const drafts = new Map<string, string>();
  // UI-06: the Ask chat sits at the bottom; its text box persists like the composer's.
  const askSection = section("Ask", "ask");
  const askTurns = el("div", "ask__turns");
  const askNote = el("p", "ask__note");
  const askEstimate = el("p", "ask__estimate");
  let askArmed = false;
  const question = el("textarea", "ask__question");
  question.rows = 2;
  question.placeholder = "Ask about this repository";
  question.setAttribute("aria-label", "Question");
  const askButtons = el("div", "ask__buttons");
  const askButton = button("Ask", "button button--primary", () => {
    if (question.value.trim() === "") return;
    const confirm = current?.ask.confirm === true;
    if (confirm && !askArmed) {
      askArmed = true;
      askButton.textContent = "Click again to ask";
      return;
    }
    askArmed = false;
    askButton.textContent = "Ask";
    post({ type: "ask", question: question.value, ...(confirm ? { confirmed: true } : {}) });
    question.value = "";
  });
  const stopButton = button("Stop", "button", () => post({ type: "cancelAsk" }));
  const clearButton = button("Clear", "link", () => post({ type: "clearAsk" }));
  askButtons.append(askButton, stopButton, clearButton);
  askSection.append(askTurns, askNote, question, askEstimate, askButtons);
  question.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !askButton.disabled) askButton.click();
  });
  container.append(header, composer, runSlot, healthSlot, maps, reviewSlot, rulesSlot, hotspotsSlot, setup, practiceSlot, session, askSection);

  let current: HomeState | null = null;
  let figures: HTMLElement | null = null;
  let setupFailing: boolean | null = null;

  function renderHeader(state: HomeState): void {
    header.replaceChildren();
    if (state.root === null) {
      header.append(el("p", "header__empty", "Open a folder to map it."));
      return;
    }
    if (state.folders.length > 1) {
      const picker = el("select", "header__folder");
      picker.setAttribute("aria-label", "Folder");
      for (const folder of state.folders) {
        const option = el("option", "", folder.name);
        option.value = folder.root;
        option.selected = folder.root === state.root;
        picker.append(option);
      }
      picker.addEventListener("change", () => post({ type: "pickFolder", root: picker.value }));
      header.append(picker);
    } else {
      header.append(el("div", "header__folder", state.folders[0]?.name ?? ""));
    }
    header.append(el("div", "header__status", mapStatus(state.maps, now())));
  }

  function renderComposer(state: HomeState): void {
    controls.replaceChildren();
    const running = state.run?.status === "running";
    focus.disabled = state.root === null;
    if (state.composer.agents.length === 0) {
      controls.append(el("span", "composer__none", "No agent found on PATH. See Setup below."));
    } else {
      const agent = el("select", "composer__agent");
      agent.setAttribute("aria-label", "Agent");
      for (const entry of state.composer.agents) {
        const option = el("option", "", entry.label);
        option.value = entry.cli;
        option.selected = entry.cli === state.composer.agent;
        agent.append(option);
      }
      agent.addEventListener("change", () => post({ type: "setAgent", agent: agent.value === "codex" || agent.value === "devin" ? agent.value : "claude" }));
      controls.append(agent);
    }
    const mode = el("div", "toggle");
    mode.setAttribute("role", "group");
    mode.setAttribute("aria-label", "Run mode");
    for (const [value, label] of [["sidebar", "In sidebar"], ["terminal", "In terminal"]] as const) {
      const option = button(label, `toggle__option${state.composer.runMode === value ? " toggle__option--on" : ""}`, () => post({ type: "setRunMode", runMode: value }));
      option.setAttribute("aria-pressed", String(state.composer.runMode === value));
      mode.append(option);
    }
    controls.append(mode);
    generate.disabled = running || state.root === null || state.composer.agent === null;
    if (!state.composer.confirm) generateArmed = false;
    generate.textContent = running ? "Generating…" : generateArmed ? SECOND_CLICK : "Generate";
    notes.replaceChildren(...state.composer.notes.map((note) => el("p", "composer__note", note)));
  }

  function renderRun(run: RunCard | null): void {
    runSlot.replaceChildren();
    figures = null;
    if (run === null) return;
    const card = el("section", `section run run--${run.status}`);
    const top = el("div", "run__top");
    top.append(el("span", "run__agent", run.mode === "terminal" ? `${run.agent} in a terminal` : run.agent), el("span", `run__status run__status--${run.status}`, STATUS_LABEL[run.status]));
    card.append(top);
    if (run.focus !== "") card.append(el("div", "run__focus", run.focus));
    const phase = phaseLine(run);
    if (phase !== null) card.append(el("div", "run__phase", phase));
    if (run.estimate !== null) card.append(el("div", "run__estimate", run.estimate));
    figures = el("div", "run__figures", runFigures(run, now()));
    card.append(figures);
    if (run.feed.length > 0) {
      const feed = el("ol", "run__feed");
      for (const item of run.feed.slice(-12)) feed.append(el("li", `feed feed--${item.kind}`, item.text));
      card.append(feed);
    }
    if (run.denials.length > 0) {
      const denied = el("div", "run__denials");
      denied.append(el("p", "run__denials-title", "The agent was refused:"));
      const list = el("ul", "run__denial-list");
      for (const denial of run.denials) list.append(el("li", "", denial));
      denied.append(list, button("Run in terminal instead", "button", () => post({ type: "runInTerminal" })));
      card.append(denied);
    }
    if (run.status === "running") card.append(button("Cancel", "button run__cancel", () => post({ type: "cancelRun" })));
    runSlot.append(card);
  }

  function mapEntry(item: MapItem): HTMLElement {
    const entry = el("li", "map");
    const open = button(item.title ?? item.runFolder, "map__title", () => post({ type: "openMap", file: item.file }));
    open.title = item.runFolder;
    const meta = [
      item.focus,
      item.agent,
      relativeAge(item.createdAt, now()),
      item.boxes === null ? null : `${item.boxes} box${item.boxes === 1 ? "" : "es"}`,
      item.changed !== null && item.changed > 0 ? `${item.changed} changed` : null,
    ].filter(
      (part): part is string => part !== null && part !== "",
    );
    const actions = el("div", "map__actions");
    actions.append(
      button("Open", "link", () => post({ type: "openMap", file: item.file })),
      button("Refresh", "link", () => post({ type: "refreshMap", file: item.file })),
      button("Export page", "link", () => post({ type: "exportMap", file: item.file })),
      button("Create tour", "link", () => post({ type: "createTour", file: item.file })),
      button("Delete", "link link--danger", () => post({ type: "deleteMap", file: item.file })),
    );
    entry.append(open, el("div", "map__meta", meta.join(" · ")), actions);
    return entry;
  }

  function renderMaps(items: MapItem[]): void {
    maps.replaceChildren();
    if (items.length === 0) return;
    const list = section("Maps", "maps");
    const entries = el("ul", "maps__list");
    for (const item of items) entries.append(mapEntry(item));
    list.append(entries);
    maps.append(list);
  }

  /** ARC-02: the Rules section, each rule with its violations and reason, and Suggest rules. */
  function renderRules(state: HomeState): void {
    rulesSlot.replaceChildren();
    if (state.root === null || state.rules === null || state.maps.length === 0) return;
    const block = section("Rules", "rules");
    if (state.rules.rules.length === 0) {
      block.append(el("p", "rules__empty", "No rules yet. Suggest some, or right-click an arrow or a box on the map."));
    } else {
      const list = el("ul", "rules__list");
      for (const rule of state.rules.rules) {
        const entry = el("li", `rule${rule.violations > 0 ? " rule--broken" : ""}`);
        entry.append(el("div", "rule__id", `${rule.id} · ${rule.violations} violation${rule.violations === 1 ? "" : "s"}`), el("div", "rule__reason", rule.reason));
        list.append(entry);
      }
      block.append(list);
    }
    block.append(button("Suggest rules", "button", () => post({ type: "suggestRules" })));
    rulesSlot.append(block);
  }

  /** ARC-05: the Health section, each line opening its view. */
  function renderHealth(state: HomeState): void {
    healthSlot.replaceChildren();
    if (state.root === null || state.health === null || state.maps.length === 0) return;
    const block = section("Health", "health");
    const list = el("ul", "health__list");
    for (const item of state.health) {
      const entry = el("li", `health__item${item.attention ? " health__item--attention" : ""}`);
      entry.append(button(item.text, "link health__open", () => post({ type: "openHealth", item: item.kind })));
      list.append(entry);
    }
    block.append(list);
    healthSlot.append(block);
  }

  /** ARC-03: the five most changed boxes over the window. */
  function renderHotspots(state: HomeState): void {
    hotspotsSlot.replaceChildren();
    if (state.root === null || state.hotspots === null || state.maps.length === 0) return;
    const block = section("Hotspots", "hotspots");
    block.append(el("p", "hotspots__window", `Most changed in the last ${state.hotspots.days} days`));
    if (state.hotspots.boxes.length === 0) block.append(el("p", "hotspots__empty", "No box's code changed in that time."));
    else {
      const list = el("ol", "hotspots__list");
      for (const box of state.hotspots.boxes) list.append(el("li", "hotspot", `${box.label} · ${box.commits} commit${box.commits === 1 ? "" : "s"} · ${box.lines} line${box.lines === 1 ? "" : "s"}`));
      block.append(list);
    }
    hotspotsSlot.append(block);
  }

  /** PRC-02: the Review changes section, with each new box candidate's actions. */
  function renderReview(state: HomeState): void {
    reviewSlot.replaceChildren();
    if (state.root === null || state.maps.length === 0) return;
    const block = section("Review changes", "review");
    block.append(button("Review changes…", "button", () => post({ type: "review" })));
    const review: ReviewView | null = state.review;
    if (review?.error) block.append(el("p", "review__error", review.error));
    if (review?.counts) {
      const { touched, stale, gone, uncovered, candidates, arrows } = review.counts;
      const newArrows = arrows > 0 ? ` · ${arrows} new arrow${arrows === 1 ? "" : "s"}` : "";
      block.append(
        el("p", "review__counts", `${review.scope}: ${touched} touched · ${stale} stale · ${gone} gone · ${uncovered} not on the map · ${candidates} new box candidate${candidates === 1 ? "" : "s"}${newArrows}`),
      );
      const list = el("ul", "review__candidates");
      for (const candidate of review.candidates) {
        const entry = el("li", "candidate");
        const actions = el("div", "map__actions");
        actions.append(
          button("Show files", "link", () => post({ type: "showFiles", dir: candidate.dir })),
          button("Add to map", "link", () => post({ type: "addToMap", dir: candidate.dir })),
          button("Ignore", "link", () => post({ type: "ignoreCandidate", dir: candidate.dir })),
        );
        entry.append(
          el("div", "candidate__dir", `${candidate.dir}/`),
          el("div", "map__meta", `${candidate.files.length} file${candidate.files.length === 1 ? "" : "s"} · ${candidate.lines} lines · suggested box: ${candidate.label}`),
          actions,
        );
        list.append(entry);
      }
      block.append(list);
      // PRC-03: a branch's own map, and refreshing it for what the review found.
      const branch = el("div", "map__actions review__branch");
      if (review.branchMap) branch.append(button("Compare with base map", "link", () => post({ type: "compareBase" })));
      if (review.canUpdate) branch.append(button("Update map for this branch", "link", () => post({ type: "updateBranchMap" })));
      if (branch.childElementCount > 0) block.append(branch);
    }
    reviewSlot.append(block);
  }

  function renderSetup(checks: Check[] | null): void {
    const failing = checks?.some((check) => !check.ok) ?? false;
    const summary = el("summary", "section__title", checks === null ? "Setup · checking…" : failing ? "Setup · needs attention" : "Setup · ready");
    setup.replaceChildren(summary);
    if (checks !== null) {
      const list = el("ul", "checks");
      for (const check of checks) {
        const row = el("li", `check check--${check.ok ? "ok" : "fail"}`);
        row.dataset["check"] = check.id;
        row.append(el("span", "check__mark", check.ok ? "✓" : "✗"), el("span", "check__detail", check.detail));
        if (!check.ok && check.fix) row.append(button(check.fix.label, "link check__fix", () => post({ type: "fix", check: check.id })));
        list.append(row);
      }
      setup.append(list, button("Check again", "link", () => post({ type: "checkSetup" })));
    }
    if (checks !== null && failing !== setupFailing) setup.open = failing;
    if (checks !== null) setupFailing = failing;
  }

  function renderSession(state: HomeState): void {
    session.replaceChildren();
    if (state.root === null) return;
    const block = section("Learning session", "learning");
    if (state.session === null) {
      block.append(button("Start learning session", "button", () => post({ type: "startLearning" })));
    } else {
      const { phase, stepIndex, stepsTotal, score } = state.session;
      const step = stepsTotal > 0 ? ` · Step ${Math.min(stepIndex + 1, stepsTotal)} of ${stepsTotal}` : "";
      block.append(el("div", "learning__status", `${phase[0]?.toUpperCase() ?? ""}${phase.slice(1)}${step} · Score ${score}`), button("Open session", "button", () => post({ type: "openSession" })));
    }
    session.append(block);
  }

  function practiceQuestion(scope: string, entry: PracticeQuestionView, index: number, busy: boolean): HTMLElement {
    const item = el("li", `practice-question practice-question--${entry.status}`);
    item.append(el("div", "practice-question__text", entry.question));
    if (entry.status === "open" || entry.status === "failed") {
      const draftKey = `${scope}\n${index}\n${entry.question}`;
      const answer = el("textarea", "practice-question__answer");
      answer.rows = 3;
      answer.setAttribute("aria-label", `Your answer to question ${index + 1}`);
      answer.value = drafts.get(draftKey) ?? entry.answer ?? "";
      answer.addEventListener("input", () => drafts.set(draftKey, answer.value));
      const send = button("Answer", "button practice-question__send", () => {
        if (answer.value.trim() !== "") post({ type: "practiceAnswer", index, answer: answer.value });
      });
      send.disabled = busy;
      if (entry.error !== null) item.append(el("p", "practice-question__error", entry.error));
      item.append(answer, send);
      return item;
    }
    item.append(el("div", "practice-question__given", entry.answer ?? ""));
    if (entry.status === "grading") item.append(el("p", "practice-question__pending", "Grading…"));
    if (entry.grade !== null) {
      const grade = el("div", `practice-grade practice-grade--${entry.grade.grade}`);
      grade.append(el("span", "practice-grade__label", GRADE_LABEL[entry.grade.grade]), el("span", "practice-grade__reason", entry.grade.reason));
      if (entry.grade.cite !== null) grade.append(spanNode(entry.grade.cite, post));
      item.append(grade);
    }
    return item;
  }

  /** SKL-01: the Practice section, with the explain-back's scopes and the folder's latest check. */
  function renderPractice(root: string | null, view: PracticeView): void {
    const key = JSON.stringify([root, view]);
    if (key === practiceKey) return;
    practiceKey = key;
    practiceSlot.replaceChildren();
    if (root === null) return;
    const block = section("Practice", "practice");
    const check = view.check;
    const busy = check !== null && (check.status === "running" || check.questions.some((entry) => entry.status === "grading"));
    if (!view.confirm) practiceArmed = null;
    const scopes = el("div", "practice__scopes");
    const buttons: HTMLButtonElement[] = [];
    for (const [scope, label] of PRACTICE_SCOPES) {
      const start = button(practiceArmed === scope ? "Click again to start" : label, "button", () => {
        if (view.confirm && practiceArmed !== scope) {
          practiceArmed = scope;
          PRACTICE_SCOPES.forEach(([, text], index) => (buttons[index]!.textContent = text));
          start.textContent = "Click again to start";
          return;
        }
        practiceArmed = null;
        start.textContent = label;
        post({ type: "practiceStart", scope, ...(view.confirm ? { confirmed: true } : {}) });
      });
      start.disabled = view.blocked !== null || busy;
      buttons.push(start);
      scopes.append(start);
    }
    block.append(el("p", "practice__intro", "Your agent asks three questions about the code and grades your answers. The results stay on this machine."), scopes);
    if (view.blocked !== null) block.append(el("p", "practice__note", view.blocked));
    else if (view.estimate !== null) block.append(el("p", "practice__estimate", view.estimate));
    if (check !== null) {
      block.append(el("div", "practice__scope", check.scope));
      if (check.status === "running") block.append(el("p", "practice__pending", "Your agent is writing three questions…"), button("Stop", "button", () => post({ type: "practiceCancel" })));
      if (check.error !== null) block.append(el("p", "practice__error", check.error));
      const list = el("ol", "practice__questions");
      check.questions.forEach((entry, index) => list.append(practiceQuestion(check.scope, entry, index, busy)));
      block.append(list);
      if (!busy) block.append(button("Clear", "link", () => post({ type: "practiceClear" })));
    }
    // SKL-03: the practice log, newest first, with dates.
    if (view.log.length > 0) {
      const log = el("ul", "practice-log");
      for (const entry of view.log) log.append(el("li", `practice-log__entry practice-log__entry--${entry.kind}`, `${entry.at.slice(0, 10)} · ${entry.title} · ${entry.detail}`));
      block.append(el("h3", "practice__subtitle", "Your practice"), log);
    }
    practiceSlot.append(block);
  }

  function askTurn(turn: AskTurn): HTMLElement {
    const entry = el("div", `turn turn--${turn.status}`);
    entry.append(el("div", "turn__question", turn.question));
    if (turn.blocks.length > 0) entry.append(renderAnswer(turn.blocks, post));
    else if (turn.status === "running") entry.append(el("p", "turn__pending", `${turn.agent} is reading the map…`));
    if (turn.error !== null) entry.append(el("p", "turn__error", turn.error));
    const input = turn.usage.input + turn.usage.cacheRead + turn.usage.cacheWrite;
    const figures = [turn.agent];
    if (input + turn.usage.output > 0) figures.push(`${tokenCount(input)} in`, `${tokenCount(turn.usage.output)} out`);
    if (turn.costUsd !== null) figures.push(`$${turn.costUsd.toFixed(2)}`);
    if (turn.status === "cancelled") figures.push("stopped");
    entry.append(el("div", "turn__figures", figures.join(" · ")));
    return entry;
  }

  function renderAsk(ask: AskView): void {
    askTurns.replaceChildren(...ask.turns.map(askTurn));
    const running = ask.turns.at(-1)?.status === "running";
    askNote.textContent = ask.blocked ?? "";
    askNote.hidden = ask.blocked === null;
    askEstimate.textContent = ask.estimate ?? "";
    askEstimate.hidden = ask.estimate === null;
    if (!ask.confirm) askArmed = false;
    askButton.textContent = askArmed ? "Click again to ask" : "Ask";
    question.disabled = ask.blocked !== null;
    askButton.disabled = ask.blocked !== null || running;
    stopButton.hidden = !running;
    clearButton.hidden = running || ask.turns.length === 0;
  }

  return {
    render(state) {
      current = state;
      renderHeader(state);
      renderComposer(state);
      renderRun(state.run);
      renderMaps(state.maps);
      renderReview(state);
      renderRules(state);
      renderHotspots(state);
      renderHealth(state);
      renderSetup(state.setup);
      renderPractice(state.root, state.practice);
      renderSession(state);
      renderAsk(state.ask);
    },
    tick() {
      if (current?.run?.status === "running" && figures !== null) figures.textContent = runFigures(current.run, now());
    },
  };
}
