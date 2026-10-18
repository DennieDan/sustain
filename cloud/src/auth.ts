// CLD-01: sign in with GitHub through next-auth. Scopes are read:user and read:org. At sign-in the
// user is recorded, their organizations mirrored and their access rechecked. The GitHub token
// stays in the encrypted session cookie and is read only on the server.
import { cookies } from "next/headers";
import type { NextAuthOptions } from "next-auth";
import { decode } from "next-auth/jwt";
import GitHubProvider from "next-auth/providers/github";
import { signIn, type SignedIn } from "./lib/access";
import { services } from "./lib/services";

const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

export function authOptions(): NextAuthOptions {
  const oauth = process.env["GITHUB_OAUTH_URL"] ?? "https://github.com";
  const api = process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  return {
    secret: process.env["NEXTAUTH_SECRET"],
    session: { strategy: "jwt", maxAge: 8 * 3600 },
    pages: { signIn: "/signin" },
    providers: [
      GitHubProvider({
        clientId: process.env["GITHUB_CLIENT_ID"] ?? "",
        clientSecret: process.env["GITHUB_CLIENT_SECRET"] ?? "",
        issuer: `${oauth}/login/oauth`,
        authorization: { url: `${oauth}/login/oauth/authorize`, params: { scope: "read:user read:org" } },
        token: `${oauth}/login/oauth/access_token`,
        userinfo: {
          url: `${api}/user`,
          async request({ tokens }) {
            const response = await fetch(`${api}/user`, { headers: { Authorization: `Bearer ${tokens.access_token ?? ""}`, Accept: "application/vnd.github+json" } });
            if (!response.ok) throw new Error(`GitHub /user: ${response.status}`);
            return (await response.json()) as Record<string, unknown>;
          },
        },
      }),
    ],
    callbacks: {
      async jwt({ token, account }) {
        if (account?.access_token) {
          const { db, github, now } = services();
          const user = await signIn(await db(), github(), account.access_token, now());
          return { ...token, uid: user.userId, login: user.login, gh: account.access_token };
        }
        return token;
      },
      async session({ session, token }) {
        return { ...session, user: { name: typeof token["login"] === "string" ? token["login"] : null, email: null, image: session.user?.image ?? null } };
      },
    },
  };
}

/** The signed-in user, read on the server from the session cookie, or `null`. */
export async function currentUser(): Promise<SignedIn | null> {
  const store = await cookies();
  const raw = SESSION_COOKIES.map((name) => store.get(name)?.value).find((value) => value !== undefined);
  const secret = process.env["NEXTAUTH_SECRET"];
  if (raw === undefined || secret === undefined) return null;
  const token = await decode({ token: raw, secret }).catch(() => null);
  if (!token || typeof token["uid"] !== "number" || typeof token["gh"] !== "string" || typeof token["login"] !== "string") return null;
  return { userId: token["uid"], login: token["login"], githubToken: token["gh"] };
}
