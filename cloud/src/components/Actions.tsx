"use client";
// Owner actions on the settings pages (CLD-03, CLD-06, CLD-11): each asks first when it deletes, calls
// the API from this site, and reloads the page.
import { useRouter } from "next/navigation";
import { useState } from "react";

async function call(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export function DeleteButton({ url, label, confirmText, then = "reload" }: { url: string; label: string; confirmText: string; then?: "reload" | "home" | "signout" }) {
  return (
    <button
      type="button"
      className="button button--danger"
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        const response = await call("DELETE", url);
        if (!response.ok) {
          window.alert(((await response.json()) as { message?: string }).message ?? "Not deleted.");
          return;
        }
        if (then === "signout") window.location.href = "/api/auth/signout";
        else if (then === "home") window.location.href = "/settings";
        else window.location.reload();
      }}
    >
      {label}
    </button>
  );
}

export function PublicToggle({ url, value, allowed }: { url: string; value: boolean; allowed: boolean }) {
  return (
    <label>
      <input
        type="checkbox"
        checked={value}
        disabled={!allowed}
        onChange={async (event) => {
          await call("POST", url, { public: event.target.checked });
          window.location.reload();
        }}
      />{" "}
      Anyone can see this repository&apos;s maps
    </label>
  );
}

export function NewToken({ url }: { url: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [name, setName] = useState("ci");
  return (
    <div>
      <input aria-label="Token name" value={name} onChange={(event) => setName(event.target.value)} />{" "}
      <button
        type="button"
        className="button"
        onClick={async () => {
          const response = await call("POST", url, { name });
          if (response.ok) setShown(((await response.json()) as { token: string }).token);
        }}
      >
        Create upload token
      </button>
      {shown ? (
        <p>
          Copy it now; it will not be shown again: <code className="new-token">{shown}</code>
        </p>
      ) : null}
    </div>
  );
}

/** CLD-06: makes a share link that lasts the chosen days, and shows it once. */
export function NewShareLink({ url, days }: { url: string; days: readonly number[] }) {
  const [shown, setShown] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div>
      {days.map((count) => (
        <button
          key={count}
          type="button"
          className="button"
          onClick={async () => {
            const response = await call("POST", url, { days: count });
            if (!response.ok) return;
            setShown(`${window.location.origin}${((await response.json()) as { url: string }).url}`);
            // The list of links is drawn on the server; refreshing it keeps the link shown here.
            router.refresh();
          }}
        >
          Share for {count} {count === 1 ? "day" : "days"}
        </button>
      ))}
      {shown ? (
        <p>
          Copy the link now. It will not be shown again: <code className="new-share">{shown}</code>
        </p>
      ) : null}
    </div>
  );
}
