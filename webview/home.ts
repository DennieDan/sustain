// The Sustain sidebar's DOM (UI-01): header, composer, run card, maps, setup and learning
// session. Built from the HomeState the host sends; every string goes in as text. The composer's
// text box persists across states, so typing survives updates.
import { mapStatus, relativeAge, runFigures, tokenCount } from "../src/model/home";
import type { AskTurn, AskView, HomeState, HomeWebviewMessage, MapItem, ReviewView, RunCard } from "../src/model/messages";
import type { Check } from "../src/model/preflight";
import { renderAnswer } from "./answer";

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
  const generate = button("Generate", "button button--primary composer__generate", () => post({ type: "generate", focus: focus.value }));
  const notes = el("div", "composer__notes");
  composer.append(focus, controls, generate, notes);
  focus.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !generate.disabled) generate.click();
  });
  const runSlot = el("div", "run-slot");
  const maps = el("div", "maps-slot");
  const reviewSlot = el("div", "review-slot");
  const setup = el("details", "section setup");
  const session = el("div", "session-slot");
  // UI-06: the Ask chat sits at the bottom; its text box persists like the composer's.
  const askSection = section("Ask", "ask");
  const askTurns = el("div", "ask__turns");
  const askNote = el("p", "ask__note");
  const question = el("textarea", "ask__question");
  question.rows = 2;
  question.placeholder = "Ask about this repository";
  question.setAttribute("aria-label", "Question");
  const askButtons = el("div", "ask__buttons");
  const askButton = button("Ask", "button button--primary", () => {
    if (question.value.trim() === "") return;
    post({ type: "ask", question: question.value });
    question.value = "";
  });
  const stopButton = button("Stop", "button", () => post({ type: "cancelAsk" }));
  const clearButton = button("Clear", "link", () => post({ type: "clearAsk" }));
  askButtons.append(askButton, stopButton, clearButton);
  askSection.append(askTurns, askNote, question, askButtons);
  question.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !askButton.disabled) askButton.click();
  });
  container.append(header, composer, runSlot, maps, reviewSlot, setup, session, askSection);

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
      agent.addEventListener("change", () => post({ type: "setAgent", agent: agent.value === "codex" ? "codex" : "claude" }));
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
    generate.textContent = running ? "Generating…" : "Generate";
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

  /** PRC-02: the Review changes section, with each new box candidate's actions. */
  function renderReview(state: HomeState): void {
    reviewSlot.replaceChildren();
    if (state.root === null || state.maps.length === 0) return;
    const block = section("Review changes", "review");
    block.append(button("Review changes…", "button", () => post({ type: "review" })));
    const review: ReviewView | null = state.review;
    if (review?.error) block.append(el("p", "review__error", review.error));
    if (review?.counts) {
      const { touched, stale, gone, uncovered, candidates } = review.counts;
      block.append(
        el("p", "review__counts", `${review.scope}: ${touched} touched · ${stale} stale · ${gone} gone · ${uncovered} not on the map · ${candidates} new box candidate${candidates === 1 ? "" : "s"}`),
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
      renderSetup(state.setup);
      renderSession(state);
      renderAsk(state.ask);
    },
    tick() {
      if (current?.run?.status === "running" && figures !== null) figures.textContent = runFigures(current.run, now());
    },
  };
}
