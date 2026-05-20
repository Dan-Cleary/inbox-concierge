import { Link, NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Inbox Concierge
          </Link>
          <nav className="flex gap-1 text-sm">
            <TabLink to="/">Inbox</TabLink>
            <TabLink to="/evals">Evals</TabLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
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
