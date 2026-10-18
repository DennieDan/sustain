// The root layout: the site header, and no third-party scripts, fonts or analytics (CLD-08).
import type { ReactNode } from "react";
import { currentUser } from "../auth";
import "./globals.css";

export const metadata = { title: "Sustain Cloud", description: "Architecture maps of your repositories. Maps, not code." };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a className="brand" href="/">
            Sustain Cloud
          </a>
          <nav>
            <a href="/docs">Docs</a>
            <a href="/gallery">Gallery</a>
            <a href="/privacy">Privacy</a>
          </nav>
          <span className="account">
            {user ? (
              <>
                <a href="/settings">{user.login}</a> · <a href="/api/auth/signout">Sign out</a>
              </>
            ) : (
              <a href="/signin">Sign in</a>
            )}
          </span>
        </header>
        {children}
      </body>
    </html>
  );
}
