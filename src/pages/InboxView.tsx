import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { CreateLabelButton } from "./BucketCreator";
import { useConfirm } from "../components/ConfirmDialog";
import BucketSuggestions from "./BucketSuggestions";
import ChatSidebar from "./ChatSidebar";
import PendingChangesBanner from "./PendingChangesBanner";
import { roomColorFor, roomNameFor, roomNoteFor } from "../lib/roomNames";

type Bucket = Doc<"buckets">;
type Email = Doc<"emails">;

type Selection = Id<"buckets"> | "all" | "unclassified";

export default function InboxView() {
  const buckets = useQuery(api.inbox.listBuckets);
  const emails = useQuery(api.inbox.listEmails);
  const stats = useQuery(api.inbox.inboxStats);
  const syncInbox = useAction(api.inbox.syncInbox);
  const startClassification = useMutation(api.workflows.startClassification);
  const deleteBucket = useMutation(api.inbox.deleteBucket);
  const { signOut } = useAuthActions();
  const { confirm, dialog } = useConfirm();

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
      onDeleteBucket={async (b) => {
        const ok = await confirm({
          title: `Remove the "${roomNameFor(b.name)}" room?`,
          message:
            "Emails in this room will be re-sorted into your remaining rooms when you apply changes.",
          confirmLabel: "Remove",
          variant: "danger",
        });
        if (ok) deleteBucket({ bucketId: b._id });
      }}
      onSignOut={() => void signOut()}
      error={error}
    />
  );

  return (
    <div className="lg:flex lg:gap-8">
      {/* Mobile: hamburger + bucket picker */}
      <div className="mb-3 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--bg)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)] hover:bg-[var(--card)]"
        >
          <RoomsIcon />
          Rooms
        </button>
        <span className="kicker">
          {stats.classified === stats.total
            ? `All ${stats.total} sorted`
            : `${stats.classified}/${stats.total} sorted`}
        </span>
      </div>

      <aside className="hidden w-[240px] shrink-0 lg:block">
        {sidebarContent}
      </aside>

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(22,34,26,0.4)] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-[var(--rule)] bg-[var(--bg)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--mute)] hover:text-[var(--ink)]"
            >
              ← Close
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <section className="min-w-0 flex-1">
        <PendingChangesBanner />
        <BucketSuggestions />
        <SectionHeader
          selected={selected}
          buckets={buckets}
          totalCount={emails.length}
          unclassifiedCount={unclassifiedCount}
          bucketCounts={bucketCounts}
        />
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
      {dialog}
    </div>
  );
}

function SectionHeader({
  selected,
  buckets,
  totalCount,
  unclassifiedCount,
  bucketCounts,
}: {
  selected: Selection;
  buckets: Bucket[];
  totalCount: number;
  unclassifiedCount: number;
  bucketCounts: Map<Id<"buckets">, number>;
}) {
  let kicker = "Inbox";
  let title = `All threads`;
  let count = totalCount;
  let note: string | null = null;

  if (selected === "unclassified") {
    kicker = "Sorting";
    title = "Unsorted";
    count = unclassifiedCount;
    note = "Will be sorted on the next re-sort.";
  } else if (selected !== "all") {
    const bucket = buckets.find((b) => b._id === selected);
    if (bucket) {
      kicker = "Room";
      title = roomNameFor(bucket.name);
      count = bucketCounts.get(bucket._id) ?? 0;
      note = bucket.isDefault ? roomNoteFor(bucket.name) : bucket.description;
    }
  }

  return (
    <div className="mb-3 flex items-baseline gap-3 border-b border-[var(--ink)] pb-3">
      <p className="kicker text-[var(--moss)]">{kicker}</p>
      <h1 className="text-[22px] font-medium leading-none tracking-tight">
        {title}
      </h1>
      <p className="num text-[12px] text-[var(--mute-dim)]">{count}</p>
      {note && (
        <p className="ml-3 hidden truncate text-[12px] text-[var(--mute)] sm:block">
          {note}
        </p>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-6">
      <div className="hidden w-60 shrink-0 space-y-3 lg:block">
        <div className="h-10 animate-pulse bg-[var(--rule-soft)]" />
        <div className="h-32 animate-pulse bg-[var(--rule-soft)]" />
      </div>
      <div className="flex-1 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse bg-[var(--rule-soft)]" />
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
      <div className="border border-[var(--ink)] bg-[var(--card-hi)] p-8 text-center sm:p-12">
        <p className="kicker text-[var(--moss)]">Begin</p>
        <h1 className="mt-3 text-[26px] font-medium leading-tight tracking-tight">
          The room is empty.
        </h1>
        <p className="mt-2 text-[13px] text-[var(--mute)]">
          We'll read your last 200 threads and sort them into rooms. Takes
          about 40 seconds.
        </p>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="mt-6 w-full border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50"
        >
          {syncing ? "Reading…" : "Sync inbox"}
        </button>
        {error && (
          <p className="mt-3 text-[11px] text-[var(--alert)]">{error}</p>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--mute)] hover:text-[var(--ink)]"
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
  const inFlight = stats.classifying + stats.reclassifying + stats.queued;
  return (
    <div className="space-y-7">
      {/* Rooms list */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="kicker">Rooms</p>
          <CreateLabelButton />
        </div>
        <ul className="border-t border-[var(--ink)]">
          <RoomRow
            label="All threads"
            count={emails.length}
            active={selected === "all"}
            onClick={() => onSelect("all")}
            bullet="hollow"
          />
          {unclassifiedCount > 0 && (
            <RoomRow
              label="Unsorted"
              count={unclassifiedCount}
              active={selected === "unclassified"}
              onClick={() => onSelect("unclassified")}
              dim
            />
          )}
          {buckets.map((b) => (
            <RoomRow
              key={b._id}
              label={roomNameFor(b.name)}
              count={bucketCounts.get(b._id) ?? 0}
              colorHex={roomColorFor(b.name, customBuckets.indexOf(b))}
              active={selected === b._id}
              onClick={() => onSelect(b._id)}
              onDelete={b.isDefault ? undefined : () => onDeleteBucket(b)}
            />
          ))}
        </ul>
      </div>

      {/* Status */}
      <div>
        <p className="kicker mb-2">Status</p>
        <dl className="space-y-1.5 border-t border-[var(--rule)] pt-2 text-[12px]">
          <StatusRow
            label="Sorted"
            value={`${stats.classified} / ${stats.total}`}
          />
          {inFlight > 0 && (
            <StatusRow
              label="Processing"
              value={String(inFlight)}
              accent
            />
          )}
          {stats.failed > 0 && (
            <StatusRow label="Failed" value={String(stats.failed)} />
          )}
        </dl>
        {error && (
          <p className="mt-2 text-[11px] text-[var(--alert)]">{error}</p>
        )}
      </div>

      {/* Account */}
      <div>
        <p className="kicker mb-2">Account</p>
        <button
          type="button"
          onClick={onSignOut}
          className="text-[12px] text-[var(--mute)] hover:text-[var(--ink)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--mute)]">{label}</span>
      <span
        className={`num text-[11px] ${accent ? "text-[var(--moss)]" : "text-[var(--ink)]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function RoomRow({
  label,
  count,
  active,
  onClick,
  onDelete,
  colorHex,
  bullet,
  dim,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  colorHex?: string;
  bullet?: "hollow" | "filled";
  dim?: boolean;
}) {
  return (
    <li
      className={`group flex cursor-pointer items-center justify-between border-b border-[var(--rule-soft)] py-2 transition-colors ${
        active ? "bg-[var(--card)]" : "hover:bg-[var(--card)]"
      }`}
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {bullet === "hollow" ? (
          <span className="inline-block h-2.5 w-2.5 shrink-0 border border-[var(--ink)]" />
        ) : colorHex ? (
          <span
            className="inline-block h-2.5 w-2.5 shrink-0"
            style={{ background: colorHex }}
          />
        ) : (
          <span className="inline-block h-2.5 w-2.5 shrink-0" />
        )}
        <span
          className={`truncate text-[13px] ${
            active ? "font-semibold text-[var(--ink)]" : ""
          } ${dim && !active ? "text-[var(--mute)]" : "text-[var(--ink)]"}`}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="num text-[11px] text-[var(--mute)] tabular-nums">
          {count}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-[11px] text-[var(--mute-dim)] opacity-0 transition-opacity hover:text-[var(--alert)] group-hover:opacity-100"
            title="Remove room"
            aria-label={`Remove ${label}`}
          >
            ×
          </button>
        )}
      </div>
    </li>
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
  const customBuckets = buckets.filter((b) => !b.isDefault);

  if (emails.length === 0) {
    return (
      <div className="border border-[var(--rule)] bg-[var(--card)] py-16 text-center">
        <p className="kicker">Empty</p>
        <p className="mt-2 text-[20px] font-medium tracking-tight">
          Nothing here needs you.
        </p>
        <p className="mt-1 text-[13px] text-[var(--mute)]">Go for a walk.</p>
      </div>
    );
  }

  return (
    <ul>
      {emails.map((e) => {
        const bucket = e.bucketId ? bucketById.get(e.bucketId) : undefined;
        const customIdx = bucket ? customBuckets.indexOf(bucket) : 0;
        const accent = bucket ? roomColorFor(bucket.name, customIdx) : "#9B9E94";
        const reclassifying = e.classifyStatus === "re-classifying";
        return (
          <li
            key={e._id}
            data-email-id={e._id}
            className={`grid cursor-default grid-cols-[1fr_70px_140px] gap-4 border-b border-[var(--rule-soft)] px-1 py-3.5 transition-colors sm:grid-cols-[1fr_80px_160px] ${
              highlightedEmailId === e._id
                ? "bg-[var(--card-hi)]"
                : "hover:bg-[var(--card)]"
            }`}
          >
            <div className="min-w-0">
              {bucket && (
                <p
                  className="kicker mb-0.5"
                  style={{
                    color: reclassifying ? "var(--mute-dim)" : accent,
                  }}
                >
                  {roomNameFor(bucket.name)}
                  {reclassifying && " · sorting"}
                </p>
              )}
              {!bucket && e.classifyStatus !== "classified" && (
                <p className="kicker mb-0.5 text-[var(--mute-dim)]">
                  {e.classifyStatus === "failed" ? "failed" : "queued"}
                </p>
              )}
              <p className="truncate text-[15px] font-semibold leading-tight">
                {extractName(e.from)}
              </p>
              <p className="truncate text-[13px] leading-snug text-[var(--ink-soft)]">
                {e.subject}
              </p>
              <p className="line-clamp-1 text-[12px] leading-snug text-[var(--mute)]">
                {e.snippet}
              </p>
            </div>
            <div className="num pt-1 text-right text-[11px] text-[var(--mute)] tabular-nums">
              {formatDate(e.date)}
            </div>
            <div className="flex items-start justify-end gap-2 pt-1">
              {bucket && (
                <span
                  className="num text-[11px] text-[var(--ink)] tabular-nums"
                  style={{
                    opacity: reclassifying ? 0.5 : 1,
                  }}
                >
                  {roomNameFor(bucket.name)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
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
      className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] hover:bg-[var(--ink-soft)]"
      aria-label="Open inbox chat"
    >
      <ChatIcon />
      Ask the room
    </button>
  );
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function RoomsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
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
