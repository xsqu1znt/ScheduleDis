import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { formatDuration, formatInterval } from "../lib/format";
import type { JobStatus, Target } from "../lib/types";
import { Reveal } from "./controls";
import { CheckIcon, ClockIcon, SendIcon, StarIcon, StopIcon, WarnIcon } from "./icons";

export type AlertTone = "good" | "warn" | "bad";

export interface Alert {
  tone: AlertTone;
  text: ReactNode;
}

interface DockProps {
  target: Target | null;
  /** Set when a preset's channel is showing instead of the open one. */
  onUseOpenChannel: (() => void) | null;
  content: string;
  onContentChange: (content: string) => void;
  saved: boolean;
  onToggleSaved: (() => void) | null;
  job: JobStatus;
  now: number;
  /** Messages this run would create. */
  count: number;
  sendsAvailable: number;
  refillMs: number;
  canSchedule: boolean;
  onSchedule: () => void;
  onStop: () => void;
  alerts: Alert[];
  barRef: RefObject<HTMLDivElement | null>;
}

const TONE_RANK: Record<AlertTone, number> = { good: 0, warn: 1, bad: 2 };

function TrayContent({ target, onUseOpenChannel, job, now, count, sendsAvailable, refillMs }: Pick<DockProps, "target" | "onUseOpenChannel" | "job" | "now" | "count" | "sendsAvailable" | "refillMs">) {
  if (job.running) {
    const next = job.waitingUntil === null ? "" : `next in ${formatInterval(Math.max(1000, job.waitingUntil - now))}, `;
    return (
      <>
        <span className="min-w-0 flex-1">
          Scheduling{" "}
          <b className="text-ink font-medium whitespace-nowrap">
            {job.done} of {job.total}
          </b>
        </span>
        <span className="ml-auto min-w-0 flex-1 text-right" title="You can close this popup, but keep the Discord tab open.">
          {next}keep Discord open
        </span>
      </>
    );
  }

  if (!target) return <span>Open a channel in Discord, or load a preset</span>;

  const heldBack = Math.max(0, count - sendsAvailable);
  const takes = formatDuration(heldBack * refillMs);
  const first = sendsAvailable > 0 ? `${sendsAvailable} queue now, the other ${heldBack}` : `All ${heldBack}`;

  return (
    <>
      <span className="flex min-w-0 flex-[1_1_160px] items-center gap-1.5">
        <span className="text-faint shrink-0 text-sm leading-none">{target.guildName ? "#" : "@"}</span>
        <b className="text-ink min-w-0 max-w-[60%] truncate font-medium" title={target.channelName}>{target.channelName}</b>
        <span className="min-w-0 flex-1 truncate" title={target.guildName ?? "Direct message"}>{target.guildName ?? "Direct message"}</span>
      </span>
      {onUseOpenChannel && (
        <button type="button" className="text-accent-soft ml-1.5 shrink-0 font-medium hover:underline" onClick={onUseOpenChannel}>
          Use open channel
        </button>
      )}
      {heldBack > 0 && (
        <button type="button" className="pace-chip" aria-label={`${first} over ${takes}. Keep the Discord tab open.`}>
          <ClockIcon />
          {takes}
          <span className="pace-tip">
            {first} over {takes}. Keep the Discord tab open.
          </span>
        </button>
      )}
    </>
  );
}

/** The bottom of the Schedule tab: channel tray, chat bar, and the alerts that grow out from under it. */
export function Dock(props: DockProps) {
  const { content, onContentChange, saved, onToggleSaved, job, count, canSchedule, onSchedule, onStop, alerts, barRef, target } = props;

  // Keeps the last alerts rendered while the strip closes, so it doesn't collapse empty.
  const lastAlerts = useRef(alerts);
  useEffect(() => {
    if (alerts.length > 0) lastAlerts.current = alerts;
  });
  const shown = alerts.length > 0 ? alerts : lastAlerts.current;
  const tone = shown.reduce<AlertTone>((worst, a) => (TONE_RANK[a.tone] > TONE_RANK[worst] ? a.tone : worst), "good");

  const scheduleLabel = `Schedule ${count} ${count === 1 ? "message" : "messages"}`;
  const progress = job.total > 0 ? (job.done / job.total) * 100 : 0;

  return (
    <div className="relative z-20 shrink-0 px-3 pb-3">
      <div className={`channel-tray ${job.running ? "running" : ""}`}>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
          <TrayContent {...props} />
        </div>
        <span className="tray-fill" style={{ width: `${progress}%` }} />
      </div>

      <div ref={barRef} className="chat-bar">
        <div className="flex items-end gap-1 p-1.5">
          <button
            type="button"
            disabled={!onToggleSaved}
            aria-pressed={saved}
            aria-label={saved ? "Remove from presets" : "Save as preset"}
            title={saved ? "Saved in Presets" : "Save as preset"}
            className={`star-button ${saved ? "text-warn" : "text-muted"}`}
            onClick={() => onToggleSaved?.()}
          >
            <StarIcon filled={saved} />
          </button>
          <textarea
            aria-label="Message"
            autoFocus
            rows={1}
            maxLength={2000}
            disabled={job.running}
            placeholder={target ? `Message ${target.guildName ? "#" : "@"}${target.channelName}` : "What should it send?"}
            value={content}
            onChange={e => onContentChange(e.target.value)}
            onKeyDown={e => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              onSchedule();
            }}
            className="placeholder:text-faint field-sizing-content max-h-24 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] leading-5 outline-none disabled:opacity-60"
          />
          {job.running ? (
            <button type="button" aria-label="Stop scheduling" title="Stop" className="send-button stop" onClick={onStop}>
              <StopIcon />
            </button>
          ) : (
            <button type="button" aria-label={scheduleLabel} title={scheduleLabel} disabled={!canSchedule} className="send-button" onClick={onSchedule}>
              <SendIcon />
              {count > 0 && <span className="send-count">{count}</span>}
            </button>
          )}
        </div>
      </div>

      <Reveal open={alerts.length > 0} extension>
        <div className={`alert-strip ${tone}`} role="status">
          {shown.map((a, i) => (
            <div key={i} className={`alert-line ${a.tone}`}>
              {a.tone === "good" ? <CheckIcon /> : <WarnIcon />}
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
