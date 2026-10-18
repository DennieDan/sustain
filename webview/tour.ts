// SKL-02: the tour player on the map. Each stop highlights its box, asks the host to open the cited
// code, explains, asks its question, and shows the answer when asked. Every string goes in as text.
import type { WebviewMessage } from "../src/model/messages";
import type { TourStop } from "../src/model/tour";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

export class TourPlayer {
  /** The card that shows the current stop. */
  readonly card: HTMLElement;
  /** The toolbar button that starts the tour; hidden when the map has none. */
  readonly start: HTMLButtonElement;
  private stops: TourStop[] = [];
  private index: number | null = null;
  private revealed = false;

  /** `mark` highlights the stop's box, or clears the highlight for `null`. */
  constructor(
    private readonly post: (message: WebviewMessage) => void,
    private readonly mark: (id: string | null) => void,
  ) {
    this.card = el("div", "tour");
    this.card.setAttribute("role", "region");
    this.card.setAttribute("aria-label", "Tour");
    this.card.hidden = true;
    this.start = button("Tour", "toolbar__button tour__start", () => this.play());
    this.start.title = "Play the map's tour";
    this.start.hidden = true;
  }

  /** The map's tour, or `null` when it has none. A tour that changes while playing starts over when played again. */
  setTour(stops: TourStop[] | null): void {
    this.stops = stops ?? [];
    this.start.hidden = this.stops.length === 0;
    if (this.index !== null && this.index >= this.stops.length) this.end();
    else if (this.index !== null) this.render();
  }

  get playing(): boolean {
    return this.index !== null;
  }

  /** Starts at the first stop. */
  play(): void {
    if (this.stops.length === 0) return;
    this.go(0);
  }

  /** Marks the current stop's box again, after the map is drawn anew. */
  reapply(): void {
    this.mark(this.index === null ? null : (this.stops[this.index]?.component ?? null));
  }

  private go(index: number): void {
    this.index = index;
    this.revealed = false;
    this.render();
    this.post({ type: "tourStop", index });
  }

  private end(): void {
    this.index = null;
    this.card.hidden = true;
    this.card.replaceChildren();
    this.mark(null);
  }

  private render(): void {
    const index = this.index!;
    const stop = this.stops[index]!;
    this.mark(stop.component);
    const answer = el("p", "tour__answer", stop.answer);
    answer.hidden = !this.revealed;
    const reveal = button("Show answer", "toolbar__button tour__reveal", () => {
      this.revealed = true;
      answer.hidden = false;
      reveal.hidden = true;
    });
    reveal.hidden = this.revealed;
    const cite = `${stop.citation.path}:${stop.citation.line}${stop.citation.end_line === undefined ? "" : `-${stop.citation.end_line}`}`;
    const code = button(cite, "cite tour__code", () => this.post({ type: "openTourCode", index }));
    code.title = "Open the code";
    const nav = el("div", "tour__nav");
    const back = button("Back", "toolbar__button", () => this.go(index - 1));
    back.disabled = index === 0;
    const last = index === this.stops.length - 1;
    const next = button(last ? "Finish" : "Next", "toolbar__button tour__next", () => {
      if (!last) return this.go(index + 1);
      this.end();
      // SKL-03: a finished tour joins the practice log.
      this.post({ type: "tourFinished" });
    });
    nav.append(back, next, button("End tour", "toolbar__button", () => this.end()));
    const question = el("p", "tour__question");
    question.append(el("strong", "", "Question: "), document.createTextNode(stop.question));
    this.card.replaceChildren(
      el("div", "tour__step", `Stop ${index + 1} of ${this.stops.length}`),
      el("h2", "tour__title", stop.title),
      el("p", "tour__explanation", stop.explanation),
      code,
      question,
      reveal,
      answer,
      nav,
    );
    this.card.hidden = false;
  }
}
