// IDE-01: the map viewer in the IntelliJ plugin's Map tab. Bundled as dist/jcef.js; the plugin's page
// inlines it after the script that defines `sustainPost`.
import { useHost } from "./bridge";
import { jcefHost } from "./hosts/jcef";
import { startViewer } from "./viewer";

useHost(jcefHost());
startViewer();
