import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import BucketCreator from "./BucketCreator";

type Bucket = Doc<"buckets">;
type Email = Doc<"emails">;

const BUCKET_TINT: Record<string, string> = {
  Important: "bg-red-500",
  "Can wait": "bg-amber-500",
  "Auto-archive": "bg-neutral-400",
  Newsletter: "bg-blue-500",
};

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

  const [selectedBucket, setSelectedBucket] = useState<
    Id<"buckets"> | "all" | "unclassified"
  >("all");
  const [syncing, setSyncing] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    buckets === undefined ||
    emails === undefined ||
    stats === undefined ||
    stats === null
  ) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
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

  const filteredEmails = filterEmails(emails, selectedBucket);
  const bucketCounts = countByBucket(emails, buckets);
  const unclassifiedCount = emails.filter(
    (e) => e.classifyStatus !== "classified",
  ).length;

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0 space-y-4">
        <div className="space-y-2">
          {emails.length === 0 ? (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync inbox (200 threads)"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleReclassify}
                disabled={reclassifying || stats.classifying > 0 || stats.reclassifying > 0}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {reclassifying ? "Triggering…" : "Reclassify all"}
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {stats.total > 0 && <StatsBar stats={stats} />}

        <nav className="rounded-md border border-neutral-200 bg-white">
          <BucketRow
            label="All"
            count={emails.length}
            active={selectedBucket === "all"}
            onClick={() => setSelectedBucket("all")}
          />
          {unclassifiedCount > 0 && (
            <BucketRow
              label="Unclassified"
              count={unclassifiedCount}
              active={selectedBucket === "unclassified"}
              onClick={() => setSelectedBucket("unclassified")}
              dim
            />
          )}
          {buckets.map((b) => (
            <BucketRow
              key={b._id}
              label={b.name}
              count={bucketCounts.get(b._id) ?? 0}
              colorClass={BUCKET_TINT[b.name] ?? "bg-neutral-400"}
              active={selectedBucket === b._id}
              onClick={() => setSelectedBucket(b._id)}
              onDelete={
                b.isDefault
                  ? undefined
                  : () => {
                      if (confirm(`Delete bucket "${b.name}"?`))
                        deleteBucket({ bucketId: b._id });
                    }
              }
            />
          ))}
        </nav>

        <BucketCreator />

        <button
          type="button"
          onClick={() => void signOut()}
          className="block text-xs text-neutral-500 underline hover:text-neutral-700"
        >
          Sign out
        </button>
      </aside>

      <section className="flex-1 min-w-0">
        {emails.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-neutral-300 bg-white py-16 text-center">
            <p className="text-neutral-600">No emails yet.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Click "Sync inbox" to pull your last 200 Gmail threads.
            </p>
          </div>
        ) : (
          <EmailList emails={filteredEmails} buckets={buckets} />
        )}
      </section>
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
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-700">
          {stats.classified}/{stats.total} classified
        </span>
        {inFlight > 0 && (
          <span className="flex items-center gap-1 text-blue-600">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></span>
            {inFlight} processing
          </span>
        )}
      </div>
      {stats.failed > 0 && (
        <p className="mt-1 text-red-600">{stats.failed} failed</p>
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
      className={`group flex items-center justify-between border-b border-neutral-100 px-3 py-2 last:border-0 ${
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
        {colorClass && (
          <span
            className={`inline-block h-2 w-2 rounded-full ${colorClass}`}
          ></span>
        )}
        <span className="truncate">{label}</span>
      </button>
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500 tabular-nums">{count}</span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="invisible text-xs text-red-500 hover:text-red-700 group-hover:visible"
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
      <div className="rounded-md border border-neutral-200 bg-white py-12 text-center text-sm text-neutral-500">
        No emails in this view.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-md border border-neutral-200 bg-white">
      {emails.map((e) => (
        <li key={e._id} className="px-4 py-3 hover:bg-neutral-50">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {extractName(e.from)}
                </p>
                <span className="text-xs text-neutral-400">
                  {formatDate(e.date)}
                </span>
              </div>
              <p className="truncate text-sm text-neutral-700">{e.subject}</p>
              <p className="truncate text-xs text-neutral-500">{e.snippet}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <StatusPill status={e.classifyStatus} />
              {e.bucketId && bucketById.has(e.bucketId) && (
                <BucketPill bucket={bucketById.get(e.bucketId)!} />
              )}
            </div>
          </div>
          {e.classifyReason && e.classifyStatus === "classified" && (
            <p className="mt-1 text-xs italic text-neutral-400">
              {e.classifyReason}
            </p>
          )}
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
  const label =
    status === "re-classifying" ? "re-classifying" : status;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function BucketPill({ bucket }: { bucket: Bucket }) {
  const tint =
    BUCKET_TINT[bucket.name] !== undefined
      ? BUCKET_TINT[bucket.name].replace("500", "100") +
        " text-" +
        BUCKET_TINT[bucket.name].split("-")[1] +
        "-700"
      : "bg-purple-100 text-purple-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tint}`}>
      {bucket.name}
    </span>
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

function filterEmails(
  emails: Email[],
  selected: Id<"buckets"> | "all" | "unclassified",
): Email[] {
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
