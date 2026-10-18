// CLD-08: the privacy page: the "maps, not code" rule and the exact upload schema.
import { UPLOAD_SCHEMA } from "../../../../src/model/upload";

export default function PrivacyPage() {
  return (
    <main className="page">
      <h1>Privacy</h1>
      <h2>Maps, not code</h2>
      <p>
        Sustain Cloud stores architecture maps, never your code. It accepts only Archify maps, their sidecars (run records, fingerprints and evidence, which hold hashes,
        not content), pull request check results and metadata: the repository, commit, branch, focus, agent and token counts. Every other field is refused, and so is anything
        that looks like a secret.
      </p>
      <p>Your coding agent runs on your machine or your CI runner. Sustain never calls a language model and never reads your repository.</p>
      <h2>What is collected about you</h2>
      <p>Your GitHub login, name and the organizations you belong to, so the cloud can apply your GitHub permissions. There are no analytics and no third-party scripts.</p>
      <h2>Deleting data</h2>
      <p>Owners can delete a map, a repository&apos;s data, or their whole account from Settings. Deletion is immediate and covers uploads, checks and tokens.</p>
      <h2>The upload schema</h2>
      <p>Uploads are checked against this schema; no object may carry extra properties.</p>
      <pre>
        <code>{JSON.stringify(UPLOAD_SCHEMA, null, 2)}</code>
      </pre>
    </main>
  );
}
