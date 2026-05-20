import { Link, NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="flex min-h-full flex-col bg-neutral-50">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg"
          >
            <Logo />
            <span>Inbox Concierge</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            <TabLink to="/">Inbox</TabLink>
            <TabLink to="/evals">Evals</TabLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}

function Logo() {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-xs font-bold text-white">
      IC
    </span>
  );
}

function TabLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 transition-colors ${
          isActive
            ? "bg-neutral-900 text-white"
            : "text-neutral-600 hover:bg-neutral-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
