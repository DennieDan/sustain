// The root layout: no third-party scripts, fonts or analytics (CLD-08).
import type { ReactNode } from "react";

export const metadata = { title: "Sustain Cloud", description: "Architecture maps of your repositories. Maps, not code." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
