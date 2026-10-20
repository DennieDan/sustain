---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Explain-back keeps answer keys in the extension host

## Context and Problem Statement

Spec v0.3 SKL-01 has the user's agent ask three questions about a change or a box and grade each answer. A grade needs the answer the agent expected. If that key reached the sidebar, the user could read it before answering, and the check would measure nothing. Where do the keys live, and what does the sidebar see?

## Considered Options

* Keep the keys in the extension host and send the sidebar a projection without them
* Send the whole check to the sidebar and hide the keys there
* Ask for the questions and the keys in separate runs

## Decision Outcome

Chosen option: "Keep the keys in the extension host and send the sidebar a projection without them", because the webview then never holds a key to leak, whatever its code does.

* One read-only run, with UI-06's argv, returns the three questions with their keys and citations as JSON. `src/model/practice.ts` checks it.
* The host keeps each check, keys included, in workspace state under `sustain.practice`. `checkView` builds what the sidebar receives: the questions, the user's answers and the grades. A grade's citation reaches the sidebar only for a file the citation rule and the deny-list accept.
* Each answer is graded in a run of its own, whose prompt holds the question, the key, the cited line and the answer between tags that mark it as the user's text.
* Nothing of a check is uploaded or written into the repository.

### Consequences

* Good, because the key never crosses the webview boundary, as `manifest.json` never does for bug hunts.
* Bad, because a check costs four agent runs, one for the questions and one for each grade.

### Confirmation

`test/dom/sidebar.test.ts` › SKL-01 checks that neither the sidebar's state nor its DOM holds a key. `test/e2e/suite/single.practice.test.ts` checks the same for the state a stub agent's questions produce.
