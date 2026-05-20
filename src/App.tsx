import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import InboxView from "./pages/InboxView";

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();

  if (isLoading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Inbox Concierge
        </h1>
        <p className="mt-2 text-neutral-600">
          Sign in with Google. We pull your last 200 Gmail threads and classify
          them.
        </p>
        <button
          type="button"
          onClick={() => void signIn("google")}
          className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return <InboxView />;
}
