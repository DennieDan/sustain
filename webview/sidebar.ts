// Sidebar webview entry point (UI-01): renders each HomeState the host sends and posts what the
// user did. Bundled as dist/sidebar.js.
import type { HomeHostMessage, HomeWebviewMessage } from "../src/viewer/protocol";
import { createHome } from "./home";

declare function acquireVsCodeApi(): { postMessage(message: HomeWebviewMessage): void };
const vscode = acquireVsCodeApi();

const app = document.createElement("div");
app.className = "home";
document.body.append(app);

// The host's clock, so a run's elapsed time does not depend on the two clocks agreeing.
let offset = 0;
const home = createHome(app, (message) => vscode.postMessage(message), () => new Date(Date.now() + offset));

window.addEventListener("message", (event: MessageEvent<HomeHostMessage>) => {
  if (event.data.type !== "state") return;
  offset = Date.parse(event.data.state.serverNow) - Date.now();
  home.render(event.data.state);
});
window.setInterval(() => home.tick(), 1000);

vscode.postMessage({ type: "ready" });
