import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { CreateLabelButton } from "./BucketCreator";
import BucketSuggestions from "./BucketSuggestions";
import ChatSidebar from "./ChatSidebar";

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
  const deleteBucket = useMutation(api.inbox.deleteBucket);
  const { signOut } = useAuthActions();

  const [selected, setSelected] = useState<Selection>("all");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [highlightedEmailId, setHighlightedEmailId] = useState<
    Id<"emails"> | null
  >(null);

  const handleCitationClick = useCallback((emailId: Id<"emails">) => {
    setHighlightedEmailId(emailId);
    // Use requestAnimationFrame so the scroll happens after the row gets
    // the highlight class — feels less janky than a raw setTimeout.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-email-id="${emailId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  useEffect(() => {
    if (!highlightedEmailId) return;
    const t = setTimeout(() => setHighlightedEmailId(null), 2200);
    return () => clearTimeout(t);
  }, [highlightedEmailId]);

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
        if (confirm(`Delete label "${b.name}"?`))
          deleteBucket({ bucketId: b._id });
      }}
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
          Labels
        </button>
        <span className="text-xs text-neutral-500">
          {stats.classified === stats.total
            ? `All ${stats.total} sorted`
            : `${stats.classified}/${stats.total} sorted`}
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
        <BucketSuggestions />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900 sm:text-lg">
            {viewTitle(selected, buckets, emails.length, unclassifiedCount, bucketCounts)}
          </h2>
        </div>
        <EmailList
          emails={filteredEmails}
          buckets={buckets}
          highlightedEmailId={highlightedEmailId}
        />
      </section>

      <ChatToggle open={chatOpen} onToggle={() => setChatOpen((v) => !v)} />
      <ChatSidebar
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onCitationClick={handleCitationClick}
      />
    </div>
  );
}

function ChatToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 hover:bg-neutral-800"
      aria-label="Open inbox chat"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Ask your inbox
    </button>
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
  if (sel === "unclassified") return `Unsorted (${unclassified})`;
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
          We'll fetch your last 200 Gmail threads and sort them into labels.
          Takes about 40 seconds.
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
  onSignOut: () => void;
  error: string | null;
}) {
  const customBuckets = buckets.filter((b) => !b.isDefault);
  return (
    <div className="space-y-4">
      <StatsBar stats={stats} />

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Labels
          </h3>
          <div className="flex items-center gap-1.5">
            <LabelCapacityBadge />
            <CreateLabelButton />
          </div>
        </div>
      <nav className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <BucketRow
          label="All"
          count={emails.length}
          active={selected === "all"}
          onClick={() => onSelect("all")}
        />
        {unclassifiedCount > 0 && (
          <BucketRow
            label="Unsorted"
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
      </div>

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
  const done = inFlight === 0 && stats.total > 0;
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-800">
          {done
            ? `All ${stats.total} emails sorted`
            : `Sorting… ${stats.classified} of ${stats.total}`}
        </span>
        {inFlight > 0 && (
          <span className="flex items-center gap-1.5 text-blue-600">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
            </span>
            {inFlight}
          </span>
        )}
      </div>
      {!done && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full bg-neutral-900 transition-all duration-300"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
      {stats.failed > 0 && (
        <p className="mt-2 text-red-600">{stats.failed} failed</p>
      )}
    </div>
  );
}

function LabelCapacityBadge() {
  const capacity = useQuery(api.inbox.labelCapacity);
  if (!capacity) return null;
  const atCap = capacity.used >= capacity.max;
  return (
    <span
      className={`text-[10px] tabular-nums ${
        atCap ? "font-semibold text-amber-600" : "text-neutral-400"
      }`}
      title={
        atCap
          ? "You've hit the label cap. Delete one to make room."
          : `${capacity.max - capacity.used} more available`
      }
    >
      {capacity.used} / {capacity.max}
    </span>
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
      className={`group relative flex cursor-pointer items-center justify-between border-b border-neutral-100 px-3 py-2 transition-colors last:border-0 ${
        active
          ? "bg-neutral-900 text-white"
          : "hover:bg-neutral-100 hover:text-neutral-900"
      }`}
      onClick={onClick}
    >
      <div
        className={`flex flex-1 items-center gap-2 text-left text-sm ${
          dim && !active ? "text-neutral-500" : ""
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
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs tabular-nums ${
            active ? "text-neutral-300" : "text-neutral-500"
          }`}
        >
          {count}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={`text-xs transition-opacity hover:text-red-500 ${
              active
                ? "text-neutral-400 hover:text-red-300"
                : "text-neutral-300 group-hover:text-neutral-400"
            }`}
            title="Delete label"
            aria-label={`Delete label ${label}`}
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
  highlightedEmailId,
}: {
  emails: Email[];
  buckets: Bucket[];
  highlightedEmailId: Id<"emails"> | null;
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
        <li
          key={e._id}
          data-email-id={e._id}
          className={`px-3 py-3 transition-colors sm:px-4 ${
            highlightedEmailId === e._id
              ? "bg-yellow-50 ring-2 ring-yellow-300"
              : "hover:bg-neutral-50"
          }`}
        >
          {/* the rest of the row stays the same */}
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
              {/* During a re-classify, keep the prior bucket visible (dimmed)
                  so the list doesn't flash empty across all 200 rows.
                  The global stats card already shows progress. */}
              {e.classifyStatus === "re-classifying" &&
              e.bucketId &&
              bucketById.has(e.bucketId) ? (
                <BucketPill bucket={bucketById.get(e.bucketId)!} dim />
              ) : (
                <>
                  <StatusPill status={e.classifyStatus} />
                  {e.bucketId && bucketById.has(e.bucketId) && (
                    <BucketPill bucket={bucketById.get(e.bucketId)!} />
                  )}
                </>
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

function BucketPill({ bucket, dim }: { bucket: Bucket; dim?: boolean }) {
  return (
    <span
      className={`relative rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-opacity ${bucketPillFor(bucket)} ${
        dim ? "animate-pulse opacity-50" : ""
      }`}
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
