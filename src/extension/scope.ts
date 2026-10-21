// The `sustain.skillScope` setting (SET-01).
import * as vscode from "vscode";
import type { SkillScope } from "../core-node/skillFiles";

/** Where skills install: `user` (the default, nothing added to the repository) or `project`. */
export function configuredScope(): SkillScope {
  return vscode.workspace.getConfiguration("sustain").get<SkillScope>("skillScope", "user") === "project" ? "project" : "user";
}
