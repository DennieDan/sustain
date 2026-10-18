// CLD-02: POST /api/v1/uploads. Authenticated by a GitHub Actions OIDC token for the repository or
// by the repository's upload token; the body must pass checkUpload and stay under 1 MiB.
import { checkUpload, MAX_UPLOAD_BYTES, type Upload } from "../../../../../../src/model/upload";
import { privateRepositoriesKept, planOfAccount } from "../../../../lib/billing";
import { privateRepositoryRefusal } from "../../../../../plans";
import { verifyOidc } from "../../../../lib/oidc";
import { services } from "../../../../lib/services";
import { repositoryForToken, saveUpload, upsertRepository, uploadsInLastHour, UPLOADS_PER_HOUR } from "../../../../lib/store";
import { TOKEN_PREFIX } from "../../../../lib/tokens";

function refuse(status: number, message: string, errors?: unknown): Response {
  return Response.json({ status: "rejected", message, ...(errors === undefined ? {} : { errors }) }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) return refuse(413, "The upload is over 1 MiB.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return refuse(413, "The upload is over 1 MiB.");
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return refuse(400, "The upload is not JSON.");
  }
  const issues = checkUpload(body);
  if (issues.length > 0) return refuse(422, "The upload is not a map, sidecars, a check and metadata.", issues);
  const upload = body as Upload;

  const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (bearer === undefined) return refuse(401, "Sign the upload with an Actions OIDC token or an upload token.");
  const { db: openDb, jwks, now } = services();
  const db = await openDb();
  const [owner, name] = upload.repo.split("/") as [string, string];
  let repo;
  let via: "oidc" | "token";
  if (bearer.startsWith(TOKEN_PREFIX)) {
    repo = await repositoryForToken(db, bearer);
    if (!repo || repo.owner !== owner || repo.name !== name) return refuse(403, "This token does not belong to that repository.");
    via = "token";
    if (upload.meta.defaultBranch) repo = await upsertRepository(db, { githubId: repo.githubId, owner, name, private: repo.private, defaultBranch: upload.meta.defaultBranch });
  } else {
    const verified = verifyOidc(bearer, upload.repo, await jwks(), now().getTime());
    if (!verified.ok) return refuse(403, `The OIDC token was refused: ${verified.reason}.`);
    repo = await upsertRepository(db, {
      githubId: verified.claims.repositoryId,
      owner,
      name,
      private: verified.claims.visibility !== "public",
      ...(upload.meta.defaultBranch ? { defaultBranch: upload.meta.defaultBranch } : {}),
    });
    via = "oidc";
  }
  if ((await uploadsInLastHour(db, repo.id, now())) >= UPLOADS_PER_HOUR) return refuse(429, `A repository may upload ${UPLOADS_PER_HOUR} times an hour.`);
  // CLD-07: the account's plan decides how many private repositories it keeps maps of.
  if (repo.private) {
    const refusal = privateRepositoryRefusal(await planOfAccount(db, owner), await privateRepositoriesKept(db, owner, repo.id));
    if (refusal !== null) return refuse(402, refusal);
  }

  const { repo: _repo, commit, branch, kind, ...rest } = upload;
  const saved = await saveUpload(db, { repoId: repo.id, kind, commit, branch, pull: upload.meta.pull ?? null, payload: rest, via, createdAt: now() });
  const url = kind === "check" && upload.meta.pull !== undefined ? `/${owner}/${name}/pull/${upload.meta.pull}` : `/${owner}/${name}`;
  return Response.json({ status: "accepted", id: saved.id, url }, { status: 201 });
}
