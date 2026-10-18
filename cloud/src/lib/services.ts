// What the routes depend on, replaceable in tests: the database, GitHub's OIDC keys, the GitHub
// API and the clock.
import { database, type Database } from "../db/client";
import { githubApi, type GitHubApi } from "./github";
import { githubJwks, type Jwks } from "./oidc";

export interface Services {
  db: () => Promise<Database>;
  jwks: () => Promise<Jwks>;
  github: () => GitHubApi;
  now: () => Date;
}

let current: Services = { db: database, jwks: () => githubJwks(), github: () => githubApi(), now: () => new Date() };

export function services(): Services {
  return current;
}

/** For tests: replaces some services and returns a function that restores them. */
export function useServices(partial: Partial<Services>): () => void {
  const saved = current;
  current = { ...current, ...partial };
  return () => {
    current = saved;
  };
}
