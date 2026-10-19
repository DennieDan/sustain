// `npm run check:docs` (FR-DOC-03): validates docs/adr against MADR 4.0 as profiled by the spec,
// checks that every relative link in docs/**/*.md outside docs/research/ resolves, and traces the v0.3 spec's IDs to the
// progress checklist (ENG-03). Dependency-free Node ESM.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ADR_FILE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const SUPERSEDED = /^superseded by \[ADR-(\d{4})\]\((\d{4}-[a-z0-9-]+\.md)\)$/;
const PLAIN_STATUSES = ["proposed", "accepted", "rejected", "deprecated"];
const REQUIRED_SECTIONS = ["## Context and Problem Statement", "## Considered Options", "## Decision Outcome", "### Consequences"];
/** Research reports link to data that stays on the researcher's machine, so their links go unchecked. */
const UNCHECKED_LINKS = "research";

/**
 * Splits `---`-delimited YAML front matter into flat `key: value` pairs (quotes stripped).
 * @param {string} text
 * @returns {{ fields: Record<string, string>, body: string } | null}
 */
export function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) return null;
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    fields[pair[1] ?? ""] = (pair[2] ?? "").trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return { fields, body: match[2] ?? "" };
}

/**
 * Lines of `body` between `heading` and the next heading of the same or higher level.
 * @param {string} body
 * @param {string} heading
 * @returns {string[] | null}
 */
function section(body, heading) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const level = heading.indexOf(" ");
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const hashes = /^(#+)\s/.exec(line);
    if (hashes && (hashes[1] ?? "").length <= level) break;
    out.push(line);
  }
  return out;
}

/**
 * Problems in one ADR file.
 * @param {string} name file name, e.g. `0001-record-architecture-decisions.md`
 * @param {string} text file content
 * @param {Set<string>} adrFiles all ADR file names (to resolve `superseded by` targets)
 * @returns {{ problems: string[], status: string | null, date: string | null }}
 */
export function checkAdr(name, text, adrFiles) {
  /** @type {string[]} */
  const problems = [];
  const parsed = parseFrontMatter(text);
  if (!parsed) return { problems: [`${name}: missing YAML front matter`], status: null, date: null };
  const { fields, body } = parsed;

  const status = fields["status"] ?? null;
  if (!status) problems.push(`${name}: front matter lacks status`);
  else if (!PLAIN_STATUSES.includes(status)) {
    const superseded = SUPERSEDED.exec(status);
    if (!superseded) problems.push(`${name}: invalid status "${status}"`);
    else if (!adrFiles.has(superseded[2] ?? "") || !(superseded[2] ?? "").startsWith(superseded[1] ?? "")) {
      problems.push(`${name}: status points at unknown ADR ${superseded[2]}`);
    }
  }
  const date = fields["date"] ?? null;
  if (!date) problems.push(`${name}: front matter lacks date`);
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`${name}: date "${date}" is not YYYY-MM-DD`);
  if (!fields["decision-makers"]) problems.push(`${name}: front matter lacks decision-makers`);

  if (!/^# \S/m.test(body)) problems.push(`${name}: missing "# <title>" heading`);
  for (const heading of REQUIRED_SECTIONS) {
    if (!section(body, heading)) problems.push(`${name}: missing section "${heading}"`);
  }
  const options = section(body, "## Considered Options");
  if (options && options.filter((line) => /^\s*[*-]\s+\S/.test(line)).length < 2) {
    problems.push(`${name}: "## Considered Options" lists fewer than two options`);
  }
  const outcome = section(body, "## Decision Outcome");
  if (outcome && !outcome.some((line) => /^Chosen option: ".+", because \S/.test(line))) {
    problems.push(`${name}: "## Decision Outcome" lacks 'Chosen option: "…", because …'`);
  }
  const consequences = section(body, "### Consequences");
  if (consequences && !consequences.some((line) => /^\s*[*-]\s+(Good|Bad|Neutral), because \S/.test(line))) {
    problems.push(`${name}: "### Consequences" lacks "Good, because …" / "Bad, because …" entries`);
  }
  return { problems, status, date };
}

/**
 * Index rows of docs/adr/README.md: `| [NNNN](file) | title | status | date |`.
 * @param {string} text
 * @returns {Map<string, { status: string, date: string }>} keyed by linked file name
 */
export function parseIndex(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const link = /^\[(\d{4})\]\(([^)]+)\)$/.exec(cells[0] ?? "");
    if (!link) continue;
    rows.set(link[2], { status: cells[2] ?? "", date: cells[3] ?? "" });
  }
  return rows;
}

/**
 * Relative link targets in markdown, ignoring fenced code, inline code, URLs and pure anchors.
 * @param {string} text
 * @returns {string[]}
 */
export function relativeLinks(text) {
  const prose = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
  /** @type {string[]} */
  const links = [];
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const target = match[1] ?? "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    links.push(target);
  }
  return links;
}

/**
 * @param {string} dir
 * @returns {string[]} absolute paths of every `.md` file under `dir`
 */
function markdownFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

/** A requirement-shaped ID, such as `SAF-06` or `NFR-SEC-01`. */
const REQUIREMENT_ID = /\b(?:[A-Z]{2,4}-)+\d{2}\b/g;

/**
 * ENG-03: the IDs the v0.3 spec defines, each the first cell of a feature table's row.
 * @param {string} spec
 * @returns {string[]}
 */
export function specIds(spec) {
  return [...spec.matchAll(/^\| ((?:[A-Z]{2,4}-)+\d{2}) \|/gm)].map((match) => match[1] ?? "");
}

/**
 * ENG-03: the ID each checklist line of progress is for, as in `- [x] **SAF-06 Hook lifecycle**`.
 * @param {string} progress
 * @returns {string[]}
 */
export function checklistIds(progress) {
  return [...progress.matchAll(/^- \[[ x]\] \*\*((?:[A-Z]{2,4}-)+\d{2})\b/gm)].map((match) => match[1] ?? "");
}

/**
 * ENG-03: every ID the v0.3 spec defines is on exactly one checklist line of progress, and every
 * requirement-shaped ID progress names is in the v0.3 spec or the v0.1 spec.
 * @param {string} specV03
 * @param {string} specV01
 * @param {string} progress
 * @returns {string[]}
 */
export function checkTraceability(specV03, specV01, progress) {
  /** @type {string[]} */
  const problems = [];
  const lines = checklistIds(progress);
  for (const id of new Set(specIds(specV03))) {
    const count = lines.filter((line) => line === id).length;
    if (count !== 1) problems.push(`progress-v0.3.md: ${id} is on ${count} checklist lines; it needs exactly one`);
  }
  const known = new Set([...specV03.matchAll(REQUIREMENT_ID), ...specV01.matchAll(REQUIREMENT_ID)].map((match) => match[0]));
  for (const id of new Set([...progress.matchAll(REQUIREMENT_ID)].map((match) => match[0]))) {
    if (!known.has(id)) problems.push(`progress-v0.3.md: ${id} is defined in neither spec`);
  }
  return problems;
}

/**
 * All problems under `docsDir` (expects `docsDir/adr/`).
 * @param {string} docsDir
 * @returns {{ problems: string[], adrCount: number, linkCount: number }}
 */
export function checkDocs(docsDir) {
  /** @type {string[]} */
  const problems = [];
  const adrDir = join(docsDir, "adr");
  const names = existsSync(adrDir) ? readdirSync(adrDir).filter((name) => /^\d{4}-/.test(name)).sort() : [];
  const adrFiles = new Set(names);

  /** @type {Map<string, string | null>} */
  const statuses = new Map();
  /** @type {Map<string, string | null>} */
  const dates = new Map();
  names.forEach((name, index) => {
    const match = ADR_FILE.exec(name);
    if (!match) {
      problems.push(`${name}: file name is not NNNN-<kebab-case-title>.md`);
      return;
    }
    const expected = String(index + 1).padStart(4, "0");
    if (match[1] !== expected) problems.push(`${name}: expected number ${expected} (numbers must be contiguous from 0001)`);
    const result = checkAdr(name, readFileSync(join(adrDir, name), "utf8"), adrFiles);
    problems.push(...result.problems);
    statuses.set(name, result.status);
    dates.set(name, result.date);
  });

  const indexPath = join(adrDir, "README.md");
  if (!existsSync(indexPath)) problems.push("adr/README.md: missing ADR index");
  else {
    const rows = parseIndex(readFileSync(indexPath, "utf8"));
    for (const name of names) {
      const row = rows.get(name);
      if (!row) problems.push(`adr/README.md: index does not list ${name}`);
      else {
        if (row.status !== statuses.get(name)) problems.push(`adr/README.md: status of ${name} is "${row.status}", file says "${statuses.get(name)}"`);
        if (row.date !== dates.get(name)) problems.push(`adr/README.md: date of ${name} is "${row.date}", file says "${dates.get(name)}"`);
      }
    }
    for (const listed of rows.keys()) {
      if (!adrFiles.has(listed)) problems.push(`adr/README.md: index lists missing file ${listed}`);
    }
  }
  if (!existsSync(join(adrDir, "template.md"))) problems.push("adr/template.md: missing MADR template");

  let linkCount = 0;
  const unchecked = join(docsDir, UNCHECKED_LINKS) + sep;
  for (const file of markdownFiles(docsDir).filter((path) => !path.startsWith(unchecked))) {
    for (const link of relativeLinks(readFileSync(file, "utf8"))) {
      linkCount += 1;
      const target = decodeURI(link.split("#")[0] ?? "");
      if (!existsSync(resolve(dirname(file), target))) {
        problems.push(`${relative(docsDir, file).split(sep).join("/")}: broken link ${link}`);
      }
    }
  }
  /** @param {string} name */
  const read = (name) => (existsSync(join(docsDir, name)) ? readFileSync(join(docsDir, name), "utf8") : null);
  const [specV03, specV01, progress] = [read("spec-v0.3.md"), read("spec.md"), read("progress-v0.3.md")];
  if (specV03 !== null && progress !== null) problems.push(...checkTraceability(specV03, specV01 ?? "", progress));
  return { problems, adrCount: names.length, linkCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const docsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
  const { problems, adrCount, linkCount } = checkDocs(docsDir);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check:docs: ${problem}`);
    process.exit(1);
  }
  console.log(`check:docs: ${adrCount} ADRs and ${linkCount} relative links OK`);
}
