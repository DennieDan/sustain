# Messages

Every notification Sustain shows in VS Code is listed here by ID, with its kind, its text and the actions it offers. Errors and warnings offer exactly one action. VS Code adds Cancel to a modal question, and Cancel is not counted. A name in braces stands for what the message fills in. The reasons in practice-blocked are the ones the sidebar's Practice section shows. `test/unit/messages.test.ts` scans the source and fails when this table and the code differ.

| ID | Kind | Text | Action |
|---|---|---|---|
| no-folder | error | Open a folder first. | Open Folder… |
| show-in-map-no-folder | error | Show in Map works on a file inside an open folder. | Open Folder… |
| map-folder-no-folder | error | Map this folder works on a folder inside an open workspace folder. | Open Folder… |
| no-map-yet | info | No architecture diagram yet. | Generate |
| new-map | info | New architecture diagram: `{run}` | Open |
| map-unreadable | error | Can't show `{file}`: {reason} | Open File |
| delete-map | warning | Delete the map in {folder}? | Delete |
| invalid-source-path | error | Invalid source path: `{path}` | Refresh Map |
| stale-reference-missing | error | Stale reference: `{path}` no longer exists | Refresh Map |
| stale-reference-lines | error | Stale reference: `{path}` has {count} lines; the diagram cites {lines} | Refresh Map |
| agent-not-found | warning | `{agent}` was not found on PATH. | Copy prompt |
| git-exclude-failed | warning | Draft and page files may show up in git status: {reason} | Open Exclude File |
| confirm-run | info | {verb} with {agent}? | {verb} |
| confirm-run-repair | warning | {verb} with {agent}? | {verb} |
| run-record-failed | warning | Could not record the run in run.json: {reason} | Open run.json |
| overwrite-skills | warning | Overwrite the existing {names} skill{s}? | Overwrite |
| skills-installed | info | Installed the Sustain skills in {place} ({kinds} for .claude). | — |
| skill-differs | warning | The {skill} skill differs from the one in Sustain {version} ({what}). Reinstall it before running? | Reinstall |
| skill-copies-differ | warning | Other copies of {skill} differ from Sustain's: {copies}. Claude Code loads the one in {loaded}. | Remove Copies |
| skill-copies-loaded | warning | Other copies of {skill} differ from Sustain's, and {agent} would load them too: {copies}. Remove them before running? | Remove |
| prompt-copied | info | Copied the prompt for {agent}. Paste it into its chat. | — |
| export-page-no-map | info | Open a map first. Export Page writes the shown map as a web page. | — |
| export-page-failed | error | Could not write the diagram page: {reason} | Try Again |
| export-page-done | info | Wrote the diagram page: {file} | Open in Browser |
| save-image-no-map | info | Open a map first. Save Image writes the shown map as a picture. | — |
| save-image-not-drawn | error | The map did not draw itself as an image. | Try Again |
| save-image-failed | error | Could not write {file}: {reason} | Try Again |
| save-image-done | info | Saved the map image: {file} | Open |
| changes-no-map | info | Generate a map first. Show Changes marks the boxes on it. | — |
| changes-failed | error | Show Changes could not read the changes. {reason} | Try Again |
| compare-no-other | info | This folder has no other map to compare with. | — |
| compare-unreadable | error | Cannot read {map} to compare with it. | Compare With… |
| review-no-map | info | Generate a map first. Review compares changes with it. | — |
| review-base-unreadable | error | Cannot read the base map {map} at {commit}. | Compare With… |
| review-ignore | warning | Ignore {folder}/ in {config}? | Ignore |
| rules-need-main-map | info | Rules use the main map's boxes. Generate a map with an empty focus first. | — |
| rules-other-map | info | Rules use the boxes of {map}. Open that map to write rules from it. | — |
| suggest-rules-no-map | info | Suggest Rules needs a main map. Generate a map with an empty focus first. | — |
| suggest-rules-none | info | Every pair of boxes with code already shares an import, or has a rule. | — |
| add-rules | warning | Add {rules} to {config}? | Add |
| config-unreadable | error | Cannot read {config}: {reason} | Open Config |
| config-invalid | error | {config}: {problems} | Open Config |
| config-not-json | error | {config} is not valid JSON: {reason} | Open Config |
| notes-need-main-map | info | The notes come from the main map. Generate a map with an empty focus first. | — |
| write-notes | warning | Write the architecture notes into {file}? | Write |
| notes-up-to-date | info | The architecture notes for agents are up to date. | — |
| note-save-failed | error | Could not save the note: {reason} | Copy Note |
| note-saved | info | Saved your note on {box} in {file}. | Refresh this box |
| audit-no-map | info | Open a map to audit it. | — |
| create-tour-no-map | info | Open a map to create a tour of it. | — |
| play-tour-no-map | info | Open a map to play its tour. | — |
| no-tour | info | This map has no tour yet. | Create Tour |
| practice-blocked | info | Check My Understanding cannot start. {reason} | — |
| practice-confirm | info | Check your understanding? | Start |
| install-skills-first | info | Install the Sustain skills first? | Install; Cancel |
| no-agent | warning | No Claude Code, Codex or Devin was found on PATH or where Devin installs. | Copy prompt |
| hooks-merge-failed | warning | The {agent} hooks could not be merged — hunt edits won't be blocked: {reason} | Start Anyway |
| codex-trust-hook | info | Codex runs Sustain's hook only once you trust it. Type /hooks in Codex to review and trust it. | — |
| hooks-removal-failed | warning | The learning session ended, but its Devin hooks could not be removed: {reason} | Try Again |
| setup-fix-copied | info | Copied: {text} | — |
| remove-sustain | warning | Remove Sustain from {folder}? | Remove |
| remove-failed | error | Sustain could not remove everything from {folder}: {reason} | Remove Again |
| remove-data | warning | Also delete {entries}? | Delete |
| remove-home-skills | info | Also remove the Sustain skills from your home folder? Other folders that use them lose them. | Remove from Home |
| removed | info | Removed Sustain from {folder}. | — |
| usage-log-saved | info | Saved the usage log. | — |
| usage-log-cleared | info | Cleared the usage log. | — |
