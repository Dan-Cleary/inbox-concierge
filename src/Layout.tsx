import { useConvexAuth } from "convex/react";
import { Link, NavLink, Outlet } from "react-router-dom";
import AtriumMark from "./components/AtriumMark";

export default function Layout() {
  const { isAuthenticated } = useConvexAuth();

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg)] text-[var(--ink)]">
      <header className="border-b border-[var(--rule)] bg-[var(--bg)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <AtriumMark size={28} />
            <span className="text-[14px] font-semibold tracking-[0.18em] uppercase">
              Atrium
            </span>
            <span className="text-[var(--mute-dim)]" aria-hidden="true">
              /
            </span>
            <span className="kicker mt-px">Inbox concierge</span>
          </Link>
          {isAuthenticated && (
            <nav className="flex items-center gap-6">
              <TabLink to="/">Inbox</TabLink>
              <TabLink to="/evals">Evals</TabLink>
              <TabLink to="/about">About</TabLink>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}

function TabLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `relative text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
          isActive
            ? "text-[var(--ink)]"
            : "text-[var(--mute)] hover:text-[var(--ink)]"
        }`
      }
    >
      {({ isActive }) => (
        <span className="relative">
          {children}
          {isActive && (
            <span className="absolute -bottom-[14px] left-0 right-0 h-[2px] bg-[var(--moss)]" />
          )}
        </span>
      )}
    </NavLink>
  );
}
