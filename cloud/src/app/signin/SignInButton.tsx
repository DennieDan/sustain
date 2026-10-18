"use client";
// Starts the GitHub sign-in (CLD-01).
import { signIn } from "next-auth/react";

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button type="button" className="button button--primary" onClick={() => void signIn("github", { callbackUrl })}>
      Sign in with GitHub
    </button>
  );
}
