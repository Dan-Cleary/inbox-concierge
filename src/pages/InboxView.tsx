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
import { labelColorFor } from "../lib/roomNames";

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
          title: `Delete "${b.name}"?`,
          message: "Emails will be re-sorted when you apply changes.",
          confirmLabel: "Delete",
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
      <div className="mb-3 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--bg)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)] hover:bg-[var(--card)]"
        >
          <RoomsIcon />
          Labels
        </button>
        <span className="kicker">
          {stats.classified === stats.total
            ? `${stats.total} sorted`
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
  let title = "Inbox";
  let count = totalCount;

  if (selected === "unclassified") {
    title = "Unsorted";
    count = unclassifiedCount;
  } else if (selected !== "all") {
    const bucket = buckets.find((b) => b._id === selected);
    if (bucket) {
      title = bucket.name;
      count = bucketCounts.get(bucket._id) ?? 0;
    }
  }

  return (
    <div className="mb-3 flex items-baseline gap-3 border-b border-[var(--ink)] pb-3">
      <h1 className="text-[22px] font-medium leading-none tracking-tight">
        {title}
      </h1>
      <p className="num text-[12px] text-[var(--mute-dim)]">{count}</p>
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
        <h1 className="text-[24px] font-medium tracking-tight">Sync inbox</h1>
        <p className="mt-2 text-[13px] text-[var(--mute)]">
          Pull your last 200 Gmail threads and sort them into labels. ~40s.
        </p>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="mt-6 w-full border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync inbox"}
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
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="kicker">Labels</p>
          <CreateLabelButton />
        </div>
        <ul className="border-t border-[var(--ink)]">
          <LabelRow
            label="All"
            count={emails.length}
            active={selected === "all"}
            onClick={() => onSelect("all")}
            bullet="hollow"
          />
          {unclassifiedCount > 0 && (
            <LabelRow
              label="Unsorted"
              count={unclassifiedCount}
              active={selected === "unclassified"}
              onClick={() => onSelect("unclassified")}
              dim
            />
          )}
          {buckets.map((b) => (
            <LabelRow
              key={b._id}
              label={b.name}
              count={bucketCounts.get(b._id) ?? 0}
              colorHex={labelColorFor(b.name, customBuckets.indexOf(b))}
              active={selected === b._id}
              onClick={() => onSelect(b._id)}
              onDelete={b.isDefault ? undefined : () => onDeleteBucket(b)}
            />
          ))}
        </ul>
      </div>

      <div className="space-y-1.5 border-t border-[var(--rule)] pt-3 text-[12px]">
        <StatusRow
          label="Sorted"
          value={`${stats.classified} / ${stats.total}`}
        />
        {inFlight > 0 && (
          <StatusRow label="Processing" value={String(inFlight)} accent />
        )}
        {stats.failed > 0 && (
          <StatusRow label="Failed" value={String(stats.failed)} />
        )}
        {error && (
          <p className="mt-2 text-[11px] text-[var(--alert)]">{error}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="text-[12px] text-[var(--mute)] hover:text-[var(--ink)]"
      >
        Sign out
      </button>
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

function LabelRow({
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
            title="Delete label"
            aria-label={`Delete ${label}`}
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
      <div className="border border-[var(--rule)] bg-[var(--card)] py-12 text-center text-[13px] text-[var(--mute)]">
        No emails here.
      </div>
    );
  }

  return (
    <ul>
      {emails.map((e) => {
        const bucket = e.bucketId ? bucketById.get(e.bucketId) : undefined;
        const customIdx = bucket ? customBuckets.indexOf(bucket) : 0;
        const accent = bucket ? labelColorFor(bucket.name, customIdx) : null;
        const reclassifying = e.classifyStatus === "re-classifying";
        return (
          <li
            key={e._id}
            data-email-id={e._id}
            className={`grid cursor-default grid-cols-[140px_180px_1fr_70px] items-center gap-4 border-b border-[var(--rule-soft)] px-1 py-3 transition-colors ${
              highlightedEmailId === e._id
                ? "bg-[var(--card-hi)]"
                : "hover:bg-[var(--card)]"
            }`}
            style={{ opacity: reclassifying ? 0.5 : 1 }}
          >
            <LabelChip name={bucket?.name ?? "Unsorted"} color={accent} />
            <p className="truncate text-[14px] font-semibold leading-tight text-[var(--ink)]">
              {extractName(e.from)}
            </p>
            <p className="min-w-0 truncate text-[14px] leading-tight text-[var(--ink)]">
              <span className="font-medium">{e.subject}</span>
              <span className="text-[var(--mute)]">
                {" "}— {decodeEntities(e.snippet)}
              </span>
            </p>
            <span className="num text-right text-[11px] text-[var(--mute)] tabular-nums">
              {formatDate(e.date)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LabelChip({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  if (!color) {
    return (
      <span className="kicker truncate text-[var(--mute-dim)]" title={name}>
        {name}
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
      style={{ color }}
      title={name}
    >
      <span
        className="inline-block h-2 w-2 shrink-0"
        style={{ background: color }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

// Gmail snippets come back HTML-encoded (we&#39;re instead of we're). Decode
// via a textarea so &amp; / &#39; / &lt; / etc render as their characters.
let __decoder: HTMLTextAreaElement | null = null;
function decodeEntities(s: string): string {
  if (!s) return "";
  if (!s.includes("&")) return s;
  if (!__decoder) __decoder = document.createElement("textarea");
  __decoder.innerHTML = s;
  return __decoder.value;
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
      Ask your inbox
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
