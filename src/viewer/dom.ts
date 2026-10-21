// Element helpers shared by the diagram viewer, the sidebar and the session webview. Text goes in
// through `textContent`, never as markup.

/** A new `tag` element. `className` and `text` are set when they are not empty. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

/** A new `type="button"` button that calls `onClick` when clicked. */
export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}
