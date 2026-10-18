// Sustain Cloud's tables (CLD-01, CLD-02, CLD-06, CLD-11). Maps and checks are stored as validated JSON;
// nothing here ever holds code. Deleting a user or repository removes everything under it.
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  login: text("login").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  login: text("login").notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.orgId] })],
);

export const repositories = pgTable(
  "repositories",
  {
    id: serial("id").primaryKey(),
    githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
    /** The GitHub account that owns the repository, and so its space. */
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    private: boolean("private").notNull(),
    publicMaps: boolean("public_maps").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("repositories_owner_name").on(table.owner, table.name)],
);

export const access = pgTable(
  "access",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["viewer", "member", "owner"] }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.repoId] })],
);

export const uploads = pgTable(
  "uploads",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["map", "check"] }).notNull(),
    commit: text("commit").notNull(),
    branch: text("branch").notNull(),
    pull: integer("pull"),
    payload: jsonb("payload").notNull(),
    via: text("via", { enum: ["oidc", "token"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("uploads_repo_kind_created").on(table.repoId, table.kind, table.createdAt)],
);

export const tokens = pgTable("tokens", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** SHA-256 of the token; the token itself is shown once and never stored. */
  hash: text("hash").notNull().unique(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

/** CLD-06: read-only links to a repository's map. Only the link's SHA-256 is stored. */
export const shareLinks = pgTable("share_links", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  hash: text("hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
