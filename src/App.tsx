import { useAction, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";

export default function App() {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Inbox Concierge
        </h1>
        <p className="mt-2 text-neutral-600">
          Sign in with Google. We pull your last 200 Gmail threads and classify
          them.
        </p>
        <AuthGate />
      </div>
    </div>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();

  if (isLoading) {
    return <p className="mt-6 text-sm text-neutral-500">Loading…</p>;
  }

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={() => void signIn("google")}
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800"
      >
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <GmailProbe />
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-sm text-neutral-500 underline hover:text-neutral-700"
      >
        Sign out
      </button>
    </div>
  );
}

function GmailProbe() {
  const probe = useAction(api.gmail.probeFirstThread);
  const [result, setResult] = useState<
    | { ok: true; data: { subject: string; from: string; snippet: string } | null }
    | { ok: false; error: string }
    | null
  >(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 text-left">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setResult(null);
          try {
            const data = await probe({});
            setResult({ ok: true, data });
          } catch (err) {
            setResult({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          } finally {
            setLoading(false);
          }
        }}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {loading ? "Fetching…" : "Fetch one Gmail thread"}
      </button>
      {result?.ok === true && result.data && (
        <div className="mt-3 text-sm">
          <div className="font-medium">{result.data.subject}</div>
          <div className="text-neutral-500">{result.data.from}</div>
          <div className="mt-1 text-neutral-600">{result.data.snippet}</div>
        </div>
      )}
      {result?.ok === true && !result.data && (
        <p className="mt-3 text-sm text-neutral-500">
          No threads found (or credentials not yet stored — try signing out and
          in again).
        </p>
      )}
      {result?.ok === false && (
        <p className="mt-3 text-sm text-red-600">{result.error}</p>
      )}
    </div>
  );
}
