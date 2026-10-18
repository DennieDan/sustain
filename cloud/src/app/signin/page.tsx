// CLD-01: sign in with GitHub. Only a same-site return path is followed.
import { SignInButton } from "./SignInButton";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const back = callbackUrl !== undefined && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/settings";
  return (
    <main className="page">
      <h1>Sign in</h1>
      <p>Sustain Cloud uses your GitHub account and follows your GitHub permissions: read access to a repository lets you view its maps, write access to work with them, admin access to manage them.</p>
      <SignInButton callbackUrl={back} />
    </main>
  );
}
