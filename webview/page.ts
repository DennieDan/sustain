// The diagram page's entry point (RCH-01): reads the map from the page's data script, draws it with
// the standalone host, and opens a clicked citation in the editor, on GitHub or as text to copy.
// Bundled as dist/page.js and inlined into each page.
import { availableTargets, openLink, TARGET_LABELS, type LinkContext, type OpenTarget } from "../src/model/openLinks";
import type { PageData } from "../src/model/page";
import { readDiagram } from "../src/model/tolerant";
import type { SourceRef } from "../src/model/types";
import { useHost } from "./bridge";
import { standaloneHost } from "./hosts/standalone";
import { startViewer } from "./viewer";

const TARGET_KEY = "sustain.openTarget";

function stored(): string | null {
  try {
    return window.localStorage.getItem(TARGET_KEY);
  } catch {
    return null;
  }
}

function store(target: OpenTarget): void {
  try {
    window.localStorage.setItem(TARGET_KEY, target);
  } catch {
    // A page opened from disk may have no storage; the choice lasts this visit.
  }
}

const data = JSON.parse(document.getElementById("sustain-data")?.textContent ?? "{}") as PageData;
const context: LinkContext = { root: data.root ?? null, project: data.project ?? null, repository: data.repository ?? null };
const targets = availableTargets(context);
let target: OpenTarget = targets.find((entry) => entry === stored()) ?? targets[0]!;

// div.open > label "Open in" + select; div.open__note for "Copied" and "Cannot open".
const bar = document.createElement("div");
bar.className = "open";
const label = document.createElement("label");
label.textContent = "Open in ";
const picker = document.createElement("select");
picker.setAttribute("aria-label", "Open citations in");
for (const entry of targets) {
  const option = document.createElement("option");
  option.value = entry;
  option.textContent = TARGET_LABELS[entry];
  option.selected = entry === target;
  picker.append(option);
}
picker.addEventListener("change", () => {
  target = picker.value as OpenTarget;
  store(target);
});
label.append(picker);
const note = document.createElement("span");
note.className = "open__note";
bar.append(label, note);

const read = readDiagram(data.doc);
const components = read.ok ? read.diagram.components : [];
// SKL-02: a tour's stops open their citations like a box's.
const tour = data.messages?.find((message) => message.type === "tour")?.stops ?? [];

function open(source: SourceRef | undefined): void {
  const link = source === undefined ? null : openLink(target, source, context);
  if (link === null) {
    note.textContent = "This citation cannot be opened here.";
    return;
  }
  if (target === "copy") {
    void navigator.clipboard?.writeText(link).then(
      () => (note.textContent = `Copied ${link}`),
      () => (note.textContent = link),
    );
    return;
  }
  if (target === "github") window.open(link, "_blank", "noopener");
  else window.location.href = link;
}

useHost(
  standaloneHost({
    post: (message) => {
      if (message.type === "openSource") open(components.find((component) => component.id === message.componentId)?.sources[message.index]);
      if (message.type === "openTourCode") open(tour[message.index]?.citation);
    },
    messages: [{ type: "load", doc: data.doc, file: data.title }, ...(data.messages ?? [])],
  }),
);
// A page with a #sustain-viewer element, such as a cloud page, gets the viewer there.
const mount = document.getElementById("sustain-viewer") ?? document.body;
startViewer(mount);
mount.append(bar);
