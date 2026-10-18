// The shared viewer (VWR-01) on a cloud page: the map's data in a JSON script, the viewer bundle,
// and the element it mounts in. Every string reaches the page as escaped JSON or text.
import { escapeJson, type PageData } from "../../../src/model/page";

export function MapViewer({ data }: { data: PageData }) {
  return (
    <>
      <link rel="stylesheet" href="/viewer.css" />
      <div id="sustain-viewer" className="map-shell" />
      <script type="application/json" id="sustain-data" dangerouslySetInnerHTML={{ __html: escapeJson(JSON.stringify(data)) }} />
      <script src="/viewer.js" defer />
    </>
  );
}
