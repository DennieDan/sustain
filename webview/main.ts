// The map viewer inside the VS Code webview (VWR-01). Bundled as dist/webview.js; the host's HTML
// links only dist/webview.css and this script.
import { useHost } from "./bridge";
import { vscodeHost } from "./hosts/vscode";
import { startViewer } from "./viewer";

useHost(vscodeHost());
startViewer();
