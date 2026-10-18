// PRC-04: the GitHub REST calls the Action makes, behind an interface the tests replace.

export interface Comment {
  id: number;
  body: string;
}

export interface GitHubClient {
  listComments(issue: number): Promise<Comment[]>;
  createComment(issue: number, body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
}

/** The client for `owner/repo` on `api`, authenticated with `token`. */
export function restClient(api: string, repository: string, token: string): GitHubClient {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`${api}/repos/${repository}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  return {
    async listComments(issue) {
      const comments: Comment[] = [];
      for (let page = 1; ; page++) {
        const batch = (await call("GET", `/issues/${issue}/comments?per_page=100&page=${page}`)) as Comment[];
        comments.push(...batch);
        if (batch.length < 100) return comments;
      }
    },
    async createComment(issue, body) {
      await call("POST", `/issues/${issue}/comments`, { body });
    },
    async updateComment(id, body) {
      await call("PATCH", `/issues/comments/${id}`, { body });
    },
  };
}
