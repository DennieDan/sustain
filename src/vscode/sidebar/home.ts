// The Sustain sidebar's DOM (UI-01): header, composer, run card, maps, setup and learning
// session. Built from the HomeState the host sends; every string goes in as text. The composer's
// text box persists across states, so typing survives updates.
import { relativeAge } from "../../core/dates";
import { mapStatus, runFigures } from "./wording";
import type { HomeState, HomeWebviewMessage, MapItem, RunCard } from "../../viewer/protocol";
import type { Check } from "../../core-node/preflight";
import { button, el } from "../../viewer/dom";

export type Post = (message: HomeWebviewMessage) => void;

function section(title: string, className: string): HTMLElement {
  const node = el("section", `section ${className}`);
  node.append(el("h2", "section__title", title));
  return node;
}

const STATUS_LABEL: Record<RunCard["status"], string> = { running: "Running", done: "Done", failed: "Failed", cancelled: "Cancelled" };
/** The Generate button once a run above `sustain.confirmAboveTokens` needs a second click (CST-03). */
const SECOND_CLICK = "Click again to generate";

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
  const generate = button("button button--primary composer__generate", "Generate", () => {
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
  const copyPrompt = button("link composer__copy", "Copy prompt for…", () => post({ type: "copyPromptFor", focus: focus.value }));
  composer.append(focus, controls, generate, copyPrompt, notes);
  focus.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !generate.disabled) generate.click();
  });
  const runSlot = el("div", "run-slot");
  const maps = el("div", "maps-slot");
  const rulesSlot = el("div", "rules-slot");
  const hotspotsSlot = el("div", "hotspots-slot");
  const healthSlot = el("div", "health-slot");
  const setup = el("details", "section setup");
  const session = el("div", "session-slot");
  container.append(header, composer, runSlot, healthSlot, maps, rulesSlot, hotspotsSlot, setup, session);

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
      const option = button(`toggle__option${state.composer.runMode === value ? " toggle__option--on" : ""}`, label, () => post({ type: "setRunMode", runMode: value }));
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
      denied.append(list, button("button", "Run in terminal instead", () => post({ type: "runInTerminal" })));
      card.append(denied);
    }
    if (run.status === "running") card.append(button("button run__cancel", "Cancel", () => post({ type: "cancelRun" })));
    runSlot.append(card);
  }

  function mapEntry(item: MapItem): HTMLElement {
    const entry = el("li", "map");
    const open = button("map__title", item.title ?? item.runFolder, () => post({ type: "openMap", file: item.file }));
    open.title = item.runFolder;
    const meta = [
      item.focus,
      item.agent,
      relativeAge(item.createdAt, now()),
      item.boxes === null ? null : `${item.boxes} box${item.boxes === 1 ? "" : "es"}`,
    ].filter(
      (part): part is string => part !== null && part !== "",
    );
    const actions = el("div", "map__actions");
    actions.append(
      button("link", "Open", () => post({ type: "openMap", file: item.file })),
      button("link link--danger", "Delete", () => post({ type: "deleteMap", file: item.file })),
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
    block.append(button("button", "Suggest rules", () => post({ type: "suggestRules" })));
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
      entry.append(button("link health__open", item.text, () => post({ type: "openHealth", item: item.kind })));
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
        if (!check.ok && check.fix) row.append(button("link check__fix", check.fix.label, () => post({ type: "fix", check: check.id })));
        list.append(row);
      }
      setup.append(list, button("link", "Check again", () => post({ type: "checkSetup" })));
    }
    if (checks !== null && failing !== setupFailing) setup.open = failing;
    if (checks !== null) setupFailing = failing;
  }

  function renderSession(state: HomeState): void {
    session.replaceChildren();
    if (state.root === null) return;
    const block = section("Learning session", "learning");
    if (state.session === null) {
      block.append(button("button", "Start learning session", () => post({ type: "startLearning" })));
    } else {
      const { phase, stepIndex, stepsTotal, score } = state.session;
      const step = stepsTotal > 0 ? ` · Step ${Math.min(stepIndex + 1, stepsTotal)} of ${stepsTotal}` : "";
      block.append(el("div", "learning__status", `${phase[0]?.toUpperCase() ?? ""}${phase.slice(1)}${step} · Score ${score}`), button("button", "Open session", () => post({ type: "openSession" })));
    }
    session.append(block);
  }

  return {
    render(state) {
      current = state;
      renderHeader(state);
      renderComposer(state);
      renderRun(state.run);
      renderMaps(state.maps);
      renderRules(state);
      renderHotspots(state);
      renderHealth(state);
      renderSetup(state.setup);
      renderSession(state);
    },
    tick() {
      if (current?.run?.status === "running" && figures !== null) figures.textContent = runFigures(current.run, now());
    },
  };
}
