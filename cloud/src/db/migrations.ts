// The database's migrations, applied in order and recorded in `migrations`. Each matches schema.ts.

export const MIGRATIONS: readonly { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
CREATE TABLE users (
  id serial PRIMARY KEY,
  github_id bigint NOT NULL UNIQUE,
  login text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organizations (
  id serial PRIMARY KEY,
  github_id bigint NOT NULL UNIQUE,
  login text NOT NULL
);
CREATE TABLE memberships (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, org_id)
);
CREATE TABLE repositories (
  id serial PRIMARY KEY,
  github_id bigint NOT NULL UNIQUE,
  owner text NOT NULL,
  name text NOT NULL,
  default_branch text NOT NULL,
  private boolean NOT NULL,
  public_maps boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repositories_owner_name UNIQUE (owner, name)
);
CREATE TABLE access (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id integer NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer', 'member', 'owner')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, repo_id)
);
CREATE TABLE uploads (
  id serial PRIMARY KEY,
  repo_id integer NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('map', 'check')),
  commit text NOT NULL,
  branch text NOT NULL,
  pull integer,
  payload jsonb NOT NULL,
  via text NOT NULL CHECK (via IN ('oidc', 'token')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_repo_kind_created ON uploads (repo_id, kind, created_at);
CREATE TABLE tokens (
  id serial PRIMARY KEY,
  repo_id integer NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name text NOT NULL,
  hash text NOT NULL UNIQUE,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
`,
  },
  {
    id: "0002_share_links",
    sql: `
CREATE TABLE share_links (
  id serial PRIMARY KEY,
  repo_id integer NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
];
