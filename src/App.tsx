import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import InboxView from "./pages/InboxView";
import AtriumMark from "./components/AtriumMark";

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [reviewerSigningIn, setReviewerSigningIn] = useState(false);

  // Reviewer-link mode: ?reviewer=<secret> auto-signs the visitor in as
  // the designated reviewer user. Strip the param after attempting so
  // the secret doesn't sit in the URL bar (or get bookmarked).
  // Intentional setState-in-effect: we have to read window.location once
  // mount completes, and we only run this branch once per page load.
  useEffect(() => {
    if (isLoading || isAuthenticated || reviewerSigningIn) return;
    const url = new URL(window.location.href);
    const secret = url.searchParams.get("reviewer");
    if (!secret) return;
    url.searchParams.delete("reviewer");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewerSigningIn(true);
    void signIn("reviewer", { secret }).catch(() => {
      setReviewerSigningIn(false);
    });
  }, [isLoading, isAuthenticated, reviewerSigningIn, signIn]);

  if (isLoading || reviewerSigningIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="kicker">
          {reviewerSigningIn ? "Signing in as reviewer" : "Loading"}
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-md items-center">
        <div className="w-full border border-[var(--ink)] bg-[var(--card-hi)] p-10 text-center">
          <div className="mx-auto inline-block">
            <AtriumMark size={44} />
          </div>
          <h1 className="mt-5 text-[26px] font-medium leading-tight tracking-tight">
            Inbox, sorted.
          </h1>
          <p className="mt-2 text-[13px] text-[var(--mute)]">
            We auto-label your last 200 emails and give you an AI agent that
            can search, sort, and manage your inbox for you.
          </p>
          <button
            type="button"
            onClick={() => void signIn("google")}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] transition-colors hover:bg-[var(--ink-soft)]"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-[var(--mute-dim)]">
            Gmail read-only. We never send, reply, or modify.
          </p>
        </div>
      </div>
    );
  }

  return <InboxView />;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}
