import { useState } from "react";
import { callPage } from "../lib/bridge";
import { formatDuration, formatSendTime } from "../lib/format";
import type { QueuedMessage } from "../lib/types";
import { Notice, TargetName } from "./controls";

interface QueueTabProps {
  tabId: number;
  now: number;
  queue: QueuedMessage[];
  loaded: boolean;
}

/** Everything currently scheduled on the account, including messages made in Discord itself. */
export function QueueTab({ tabId, now, queue, loaded }: QueueTabProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    setError(await callPage(tabId, "cancel", ids));
    setBusy(false);
    setConfirming(false);
  };

  if (queue.length === 0) {
    return <p className="text-muted py-8 text-center text-xs">{loaded ? "Nothing scheduled." : "Loading…"}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <ol className="bg-panel max-h-96 overflow-y-auto rounded-lg py-1">
        {queue.map(q => (
          <li key={q.id} className="group flex items-center gap-2 py-1.5 pr-1.5 pl-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 tabular-nums">
                <span>{formatSendTime(q.sendAt, now)}</span>
                {q.failed ? <span className="text-bad text-xs">Failed</span> : <span className="text-muted text-xs">in {formatDuration(q.sendAt - now)}</span>}
              </div>
              <div className="text-muted flex gap-1 truncate text-xs">
                <span className="text-ink/80 truncate">{q.content}</span>
                <span className="shrink-0">in</span>
                <TargetName {...q} />
              </div>
            </div>
            <button
              type="button"
              aria-label={`Cancel ${q.content} at ${formatSendTime(q.sendAt, now)}`}
              disabled={busy}
              className="text-faint hover:bg-field hover:text-bad size-7 shrink-0 rounded-md disabled:opacity-30"
              onClick={() => void cancel([q.id])}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      {error && <Notice tone="bad">{error}</Notice>}

      {confirming ? (
        <div className="flex gap-2">
          <button type="button" disabled={busy} className="bg-field hover:bg-field-hover h-9 flex-1 rounded-lg text-xs font-medium" onClick={() => setConfirming(false)}>
            Keep them
          </button>
          <button
            type="button"
            disabled={busy}
            className="bg-bad h-9 flex-1 rounded-lg text-xs font-medium text-white disabled:opacity-50"
            onClick={() => void cancel(queue.map(q => q.id))}
          >
            {busy ? "Cancelling…" : `Yes, cancel all ${queue.length}`}
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} className="bg-field hover:bg-field-hover text-bad h-9 rounded-lg text-xs font-medium" onClick={() => setConfirming(true)}>
          Cancel all
        </button>
      )}
    </div>
  );
}
