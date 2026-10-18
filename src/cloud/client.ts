// CLD-09: the only code in src/ that sends anything over the network. It uploads to Sustain Cloud
// when the user runs `sustain.mjs publish` or sets the Action's `upload`, and asks GitHub Actions
// for an OIDC token for that upload. Nothing else in src/ may use the network (spec §3).

/** The audience Sustain Cloud expects in an Actions OIDC token. */
export const CLOUD_AUDIENCE = "sustain-cloud";

export type UploadResult = { ok: true; status: number; body: unknown } | { ok: false; status: number; body: unknown; message: string };

/** POSTs `payload` to `<cloud>/api/v1/uploads`, signed with `bearer`. */
export async function postUpload(cloud: string, bearer: string, payload: unknown, fetcher: typeof fetch = fetch): Promise<UploadResult> {
  const response = await fetcher(`${cloud.replace(/\/+$/, "")}/api/v1/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, status: response.status, body };
  const message = (body as { message?: unknown } | null)?.message;
  return { ok: false, status: response.status, body, message: typeof message === "string" ? message : `Sustain Cloud answered ${response.status}` };
}

/**
 * An OIDC token for Sustain Cloud from the running GitHub Actions job. The job needs
 * `permissions: id-token: write`, which provides the two ACTIONS_ID_TOKEN_REQUEST_* variables.
 */
export async function actionsOidcToken(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): Promise<string> {
  const url = env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  const token = env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"];
  if (!url || !token) throw new Error("Uploading needs `permissions: id-token: write` on the job.");
  const response = await fetcher(`${url}${url.includes("?") ? "&" : "?"}audience=${CLOUD_AUDIENCE}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`GitHub Actions refused an OIDC token: ${response.status}`);
  const value = ((await response.json()) as { value?: unknown }).value;
  if (typeof value !== "string") throw new Error("GitHub Actions returned no OIDC token.");
  return value;
}
