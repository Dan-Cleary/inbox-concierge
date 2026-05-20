import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import BucketCreator from "./BucketCreator";

type Bucket = Doc<"buckets">;
type Email = Doc<"emails">;

const BUCKET_DOT: Record<string, string> = {
  Important: "bg-red-500",
  "Can wait": "bg-amber-500",
  "Auto-archive": "bg-neutral-400",
  Newsletter: "bg-blue-500",
};

const BUCKET_PILL: Record<string, string> = {
  Important: "bg-red-50 text-red-700 ring-red-200",
  "Can wait": "bg-amber-50 text-amber-700 ring-amber-200",
  "Auto-archive": "bg-neutral-100 text-neutral-700 ring-neutral-200",
  Newsletter: "bg-blue-50 text-blue-700 ring-blue-200",
};

const CUSTOM_PALETTE = [
  "bg-purple-500",
  "bg-emerald-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-yellow-500",
  "bg-indigo-500",
];

function bucketDotFor(bucket: Bucket, fallbackIndex: number): string {
  return BUCKET_DOT[bucket.name] ?? CUSTOM_PALETTE[fallbackIndex % CUSTOM_PALETTE.length];
}

function bucketPillFor(bucket: Bucket): string {
  return (
    BUCKET_PILL[bucket.name] ??
    "bg-purple-50 text-purple-700 ring-purple-200"
  );
}

type Selection = Id<"buckets"> | "all" | "unclassified";

export default function InboxView() {
  const buckets = useQuery(api.inbox.listBuckets);
  const emails = useQuery(api.inbox.listEmails);
  const stats = useQuery(api.inbox.inboxStats);
  const syncInbox = useAction(api.inbox.syncInbox);
  const startClassification = useMutation(api.workflows.startClassification);
  const startReclassification = useMutation(
    api.workflows.startReclassification,
  );
  const deleteBucket = useMutation(api.inbox.deleteBucket);
  const { signOut } = useAuthActions();

  const [selected, setSelected] = useState<Selection>("all");
  const [syncing, setSyncing] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (
    buckets === undefined ||
    emails === undefined ||
    stats === undefined ||
    stats === null
  ) {
    return <LoadingSkeleton />;
  }

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncInbox({ maxThreads: 200 });
      if (result.inserted > 0) {
        await startClassification({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleReclassify = async () => {
    setReclassifying(true);
    setError(null);
    try {
      await startReclassification({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReclassifying(false);
    }
  };

  if (emails.length === 0) {
    return (
      <EmptyInboxState
        onSync={handleSync}
        syncing={syncing}
        error={error}
        onSignOut={() => void signOut()}
      />
    );
  }

  const filteredEmails = filterEmails(emails, selected);
  const bucketCounts = countByBucket(emails, buckets);
  const unclassifiedCount = emails.filter(
    (e) => e.classifyStatus !== "classified",
  ).length;

  const sidebarContent = (
    <Sidebar
      buckets={buckets}
      emails={emails}
      stats={stats}
      bucketCounts={bucketCounts}
      unclassifiedCount={unclassifiedCount}
      selected={selected}
      onSelect={(s) => {
        setSelected(s);
        setMobileSidebarOpen(false);
      }}
      onDeleteBucket={(b) => {
        if (confirm(`Delete bucket "${b.name}"?`))
          deleteBucket({ bucketId: b._id });
      }}
      onReclassify={handleReclassify}
      reclassifying={reclassifying}
      onSignOut={() => void signOut()}
      error={error}
    />
  );

  return (
    <div className="lg:flex lg:gap-6">
      {/* Mobile: hamburger + bucket picker */}
      <div className="mb-3 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <BucketIcon />
          Buckets
        </button>
        <span className="text-xs text-neutral-500">
          {stats.classified}/{stats.total} classified
        </span>
      </div>

      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebarContent}</aside>

      {/* Sidebar — mobile drawer */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-neutral-50 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="mb-3 text-xs text-neutral-500"
            >
              ← Close
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <section className="flex-1 min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900 sm:text-lg">
            {viewTitle(selected, buckets, emails.length, unclassifiedCount, bucketCounts)}
          </h2>
        </div>
        <EmailList emails={filteredEmails} buckets={buckets} />
      </section>
    </div>
  );
}

function viewTitle(
  sel: Selection,
  buckets: Bucket[],
  total: number,
  unclassified: number,
  counts: Map<Id<"buckets">, number>,
): string {
  if (sel === "all") return `All (${total})`;
  if (sel === "unclassified") return `Unclassified (${unclassified})`;
  const bucket = buckets.find((b) => b._id === sel);
  if (!bucket) return "Inbox";
  return `${bucket.name} (${counts.get(bucket._id) ?? 0})`;
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-6">
      <div className="hidden w-64 shrink-0 space-y-3 lg:block">
        <div className="h-10 animate-pulse rounded-md bg-neutral-200" />
        <div className="h-32 animate-pulse rounded-md bg-neutral-200" />
      </div>
      <div className="flex-1 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-md bg-neutral-200"
          />
        ))}
      </div>
    </div>
  );
}

function EmptyInboxState({
  onSync,
  syncing,
  error,
  onSignOut,
}: {
  onSync: () => void;
  syncing: boolean;
  error: string | null;
  onSignOut: () => void;
}) {
  return (
    <div className="mx-auto max-w-md pt-8 sm:pt-16">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-white">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Pull your inbox
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          We'll fetch your last 200 Gmail threads and classify them into
          buckets. Takes about 40 seconds.
        </p>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="mt-5 w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync inbox"}
        </button>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 text-xs text-neutral-500 hover:text-neutral-700"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Sidebar({
  buckets,
  emails,
  stats,
  bucketCounts,
  unclassifiedCount,
  selected,
  onSelect,
  onDeleteBucket,
  onReclassify,
  reclassifying,
  onSignOut,
  error,
}: {
  buckets: Bucket[];
  emails: Email[];
  stats: {
    total: number;
    queued: number;
    classifying: number;
    classified: number;
    reclassifying: number;
    failed: number;
  };
  bucketCounts: Map<Id<"buckets">, number>;
  unclassifiedCount: number;
  selected: Selection;
  onSelect: (s: Selection) => void;
  onDeleteBucket: (b: Bucket) => void;
  onReclassify: () => void;
  reclassifying: boolean;
  onSignOut: () => void;
  error: string | null;
}) {
  const customBuckets = buckets.filter((b) => !b.isDefault);
  return (
    <div className="space-y-4">
      <StatsBar stats={stats} />

      <nav className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <BucketRow
          label="All"
          count={emails.length}
          active={selected === "all"}
          onClick={() => onSelect("all")}
        />
        {unclassifiedCount > 0 && (
          <BucketRow
            label="Unclassified"
            count={unclassifiedCount}
            active={selected === "unclassified"}
            onClick={() => onSelect("unclassified")}
            dim
          />
        )}
        {buckets.map((b) => (
          <BucketRow
            key={b._id}
            label={b.name}
            count={bucketCounts.get(b._id) ?? 0}
            colorClass={bucketDotFor(b, customBuckets.indexOf(b))}
            active={selected === b._id}
            onClick={() => onSelect(b._id)}
            onDelete={
              b.isDefault ? undefined : () => onDeleteBucket(b)
            }
          />
        ))}
      </nav>

      <BucketCreator />

      <button
        type="button"
        onClick={onReclassify}
        disabled={reclassifying || stats.classifying > 0 || stats.reclassifying > 0}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        {reclassifying ? "Triggering…" : "Reclassify all"}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={onSignOut}
        className="block text-xs text-neutral-500 hover:text-neutral-700"
      >
        Sign out
      </button>
    </div>
  );
}

function StatsBar({
  stats,
}: {
  stats: {
    total: number;
    queued: number;
    classifying: number;
    classified: number;
    reclassifying: number;
    failed: number;
  };
}) {
  const inFlight = stats.classifying + stats.reclassifying + stats.queued;
  const pct = stats.total > 0 ? stats.classified / stats.total : 0;
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-800">
          {stats.classified}/{stats.total} classified
        </span>
        {inFlight > 0 && (
          <span className="flex items-center gap-1.5 text-blue-600">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
            </span>
            {inFlight} processing
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full bg-neutral-900 transition-all duration-300"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      {stats.failed > 0 && (
        <p className="mt-2 text-red-600">{stats.failed} failed</p>
      )}
    </div>
  );
}

function BucketRow({
  label,
  count,
  active,
  onClick,
  onDelete,
  colorClass,
  dim,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  colorClass?: string;
  dim?: boolean;
}) {
  return (
    <div
      className={`group flex items-center justify-between border-b border-neutral-100 px-3 py-2 transition-colors last:border-0 ${
        active ? "bg-neutral-100" : "hover:bg-neutral-50"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`flex flex-1 items-center gap-2 text-left text-sm ${
          dim ? "text-neutral-500" : "text-neutral-800"
        }`}
      >
        {colorClass ? (
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${colorClass}`}
          ></span>
        ) : (
          <span className="inline-block h-2.5 w-2.5 shrink-0"></span>
        )}
        <span className="truncate">{label}</span>
      </button>
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500 tabular-nums">{count}</span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-neutral-300 transition-opacity hover:text-red-600 group-hover:text-neutral-400"
            title="Delete bucket"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function EmailList({
  emails,
  buckets,
}: {
  emails: Email[];
  buckets: Bucket[];
}) {
  const bucketById = new Map(buckets.map((b) => [b._id, b]));
  if (emails.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white py-16 text-center text-sm text-neutral-500 shadow-sm">
        No emails in this view.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      {emails.map((e) => (
        <li key={e._id} className="px-3 py-3 transition-colors hover:bg-neutral-50 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {extractName(e.from)}
                </p>
                <span className="shrink-0 text-xs text-neutral-400">
                  {formatDate(e.date)}
                </span>
              </div>
              <p className="truncate text-sm text-neutral-700">{e.subject}</p>
              <p className="line-clamp-1 text-xs text-neutral-500">
                {e.snippet}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <StatusPill status={e.classifyStatus} />
              {e.bucketId && bucketById.has(e.bucketId) && (
                <BucketPill bucket={bucketById.get(e.bucketId)!} />
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: Email["classifyStatus"] }) {
  if (status === "classified") return null;
  const cls =
    status === "classifying" || status === "re-classifying"
      ? "bg-blue-100 text-blue-700"
      : status === "queued"
        ? "bg-neutral-100 text-neutral-600"
        : "bg-red-100 text-red-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function BucketPill({ bucket }: { bucket: Bucket }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${bucketPillFor(bucket)}`}
    >
      {bucket.name}
    </span>
  );
}

function BucketIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  );
}

function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return match?.[1]?.trim() ?? from;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : d.toLocaleDateString();
}

function filterEmails(emails: Email[], selected: Selection): Email[] {
  if (selected === "all") return emails;
  if (selected === "unclassified")
    return emails.filter((e) => e.classifyStatus !== "classified");
  return emails.filter((e) => e.bucketId === selected);
}

function countByBucket(
  emails: Email[],
  buckets: Bucket[],
): Map<Id<"buckets">, number> {
  const m = new Map<Id<"buckets">, number>();
  for (const b of buckets) m.set(b._id, 0);
  for (const e of emails) {
    if (e.bucketId && m.has(e.bucketId)) {
      m.set(e.bucketId, m.get(e.bucketId)! + 1);
    }
  }
  return m;
}
