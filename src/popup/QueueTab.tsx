import { useState } from "react";
import { callPage } from "../lib/bridge";
import { formatDuration, formatSendTime } from "../lib/format";
import type { QueuedMessage } from "../lib/types";
import { HoldButton, Notice, TargetName } from "./controls";

interface QueueTabProps {
  tabId: number;
  now: number;
  queue: QueuedMessage[];
  loaded: boolean;
}

/** Everything currently scheduled on the account, including messages made in Discord itself. */
export function QueueTab({ tabId, now, queue, loaded }: QueueTabProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    setError(await callPage(tabId, "cancel", ids));
    setBusy(false);
  };

  if (queue.length === 0) {
    return (
      <div className="text-muted px-6 py-10 text-center text-[13px] leading-normal">
        <b className="text-ink mb-1 block text-sm font-medium">{loaded ? "Nothing scheduled" : "Loading…"}</b>
        {loaded && "Messages you schedule show up here, including ones made in Discord."}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2.5 p-3.5">
      <ol className="bg-panel grid min-h-0 grid-cols-[minmax(0,1fr)_auto] overflow-y-auto rounded-lg py-1 min-[440px]:grid-cols-[max-content_minmax(0,1fr)_auto]">
        {queue.map(q => (
          <li key={q.id} className="col-span-full grid grid-cols-subgrid items-center gap-x-3 py-1 pr-1.5 pl-3 tabular-nums">
            <span className="min-w-0 min-[440px]:whitespace-nowrap">
              {formatSendTime(q.sendAt, now)}
              {q.failed ? <span className="text-bad ml-1.5 text-xs">Failed</span> : <span className="text-muted ml-1.5 text-xs">in {formatDuration(q.sendAt - now)}</span>}
            </span>
            <span className="text-muted col-start-1 row-start-2 flex min-w-0 gap-1 text-xs min-[440px]:col-start-auto min-[440px]:row-start-auto">
              <span className="text-ink truncate">{q.content}</span>
              <span className="shrink-0">in</span>
              <TargetName {...q} />
            </span>
            <button
              type="button"
              aria-label={`Cancel ${q.content} at ${formatSendTime(q.sendAt, now)}`}
              disabled={busy}
              className="text-faint hover:bg-danger col-start-2 row-span-2 row-start-1 size-[26px] rounded-md hover:text-white disabled:opacity-30 min-[440px]:col-start-auto min-[440px]:row-span-1 min-[440px]:row-start-auto"
              onClick={() => void cancel([q.id])}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      {error && <Notice tone="bad">{error}</Notice>}

      {busy ? (
        <div className="bg-danger/50 flex h-[38px] shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-white">Cancelling…</div>
      ) : (
        <HoldButton label={`cancel all ${queue.length}`} onConfirm={() => void cancel(queue.map(q => q.id))} />
      )}
    </div>
  );
}
