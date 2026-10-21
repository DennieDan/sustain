---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Bug kinds per language

## Context and Problem Statement

ADR-0038 seeds three bug kinds, all in JavaScript and TypeScript, and ADR-0037 lets `inject` touch only those files. Spec v0.3 LRN-02 adds Java for CS2103 projects: off-by-one, a flipped comparison and the `&&`/`||` swap (T1), and `equals` replaced by `==` on objects (T2). Java's generic types put `<` and `>` where JavaScript has comparisons. How do the tables grow without planting a bug the manifest does not describe?

## Considered Options

* One rewrite table per kind and language, with Java's generic type arguments masked like strings
* Shared tables, applied to every language
* A Java parser

## Decision Outcome

Chosen option: "One rewrite table per kind and language, with Java's generic type arguments masked like strings", because a kind applies only where its table is written, and the engine stays dependency-free.

* `inject` takes `.java` files besides ADR-0037's JavaScript and TypeScript extensions. The file's language decides which kinds it offers. A kind outside them is an error that names the language's kinds.
* Java offers `off-by-one` and `flipped-comparison`, with ADR-0038's tables, plus `and-or-swap` (`&&` to `||`, else `||` to `&&`, T1, 10 points) and `reference-equality` (`a.equals(b)` to `a == b`, and `!a.equals(b)` to `a != b`, T2, 20 points). `missing-await` stays with JavaScript and TypeScript.
* Before matching a Java line, the engine masks generic type arguments as it masks strings and comments. A span counts when it opens with an upper-case letter, `?` or `>`, and holds only names, spaces, `,`, `.`, `?`, `[]`, a single `&` and nested angle brackets. A comparison that looks like one loses its target, as ADR-0038 accepts.
* `reference-equality` takes a receiver of names and calls without arguments that nest, never `super`, and an argument without a top-level comma, so `Objects.equals(a, b)` is left alone.
* The manifest's `kind` gains the two names. ADR-0037's command contract is otherwise unchanged.

### Consequences

* Good, because CS2103 students can hunt in their own Java code.
* Bad, because a comparison such as `f(a < B, c > d)` reads as type arguments and offers no target.

### Confirmation

`test/unit/agent/javaMutations.test.ts` checks each Java kind on an AB3-style fixture, with generics, strings and comments left alone.
