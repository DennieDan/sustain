// The GitHub REST calls the cloud makes with a signed-in user's token (CLD-01). The base URL comes
// from GITHUB_API_URL, so the [web] tests point it at a mock.

export interface GitHubPermissions {
  admin?: boolean;
  maintain?: boolean;
  push?: boolean;
  triage?: boolean;
  pull?: boolean;
}

export interface GitHubRepository {
  id: number;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  permissions: GitHubPermissions;
}

export interface GitHubApi {
  user(token: string): Promise<{ id: number; login: string; name: string | null }>;
  organizations(token: string): Promise<{ id: number; login: string }[]>;
  /** The repository as the user sees it, or `null` when they cannot see it. */
  repository(token: string, owner: string, name: string): Promise<GitHubRepository | null>;
}

export function githubApi(base = process.env["GITHUB_API_URL"] ?? "https://api.github.com", fetcher: typeof fetch = fetch): GitHubApi {
  const get = async (token: string, path: string): Promise<Response> =>
    fetcher(`${base}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  return {
    async user(token) {
      const response = await get(token, "/user");
      if (!response.ok) throw new Error(`GitHub /user: ${response.status}`);
      const body = (await response.json()) as { id: number; login: string; name?: string | null };
      return { id: body.id, login: body.login, name: body.name ?? null };
    },
    async organizations(token) {
      const response = await get(token, "/user/orgs?per_page=100");
      if (!response.ok) throw new Error(`GitHub /user/orgs: ${response.status}`);
      return ((await response.json()) as { id: number; login: string }[]).map((org) => ({ id: org.id, login: org.login }));
    },
    async repository(token, owner, name) {
      const response = await get(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`GitHub /repos/${owner}/${name}: ${response.status}`);
      const body = (await response.json()) as { id: number; name: string; owner: { login: string }; private: boolean; default_branch: string; permissions?: GitHubPermissions };
      return { id: body.id, owner: body.owner.login, name: body.name, private: body.private, defaultBranch: body.default_branch, permissions: body.permissions ?? {} };
    },
  };
}
