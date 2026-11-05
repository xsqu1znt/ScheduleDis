import { useEffect, useState } from "react";
import { callPage } from "../lib/bridge";
import { formatDuration, formatInterval, formatSendTime } from "../lib/format";
import { buildPlan, lastQueuedAt, resolveFirstSend, RULES, spacingMs, type StartChoice } from "../lib/plan";
import { addRecent, loadDraft, saveDraft, type Draft, type RecentRun } from "../lib/storage";
import type { JobStatus, QueuedMessage, Target } from "../lib/types";
import { FieldLabel, Notice, Stepper, TargetName } from "./controls";

type StartMode = StartChoice["mode"];

interface ScheduleTabProps {
  tabId: number;
  now: number;
  limit: number;
  current: Target | null;
  queue: QueuedMessage[];
  job: JobStatus;
  sendsAvailable: number;
  refillMs: number;
}

const OPTIONS = {
  maxIntervalMin: 24 * 60,
  maxBufferSec: 600,
  bufferStepSec: 5,
  // A finished run's result stays on screen this long, in case the popup was closed while it ran.
  resultVisibleMs: 5 * 60_000,
} as const;

const START_MODES: { mode: StartMode; label: string }[] = [
  { mode: "delay", label: "In" },
  { mode: "time", label: "At" },
  { mode: "after-last", label: "After last" },
];

function JobResult({ job, now }: { job: JobStatus; now: number }) {
  if (job.finishedAt === null || now - job.finishedAt > OPTIONS.resultVisibleMs) return null;
  if (job.error) return <Notice tone="bad">Scheduled {job.done} of {job.total}, then stopped: {job.error}</Notice>;
  if (job.done < job.total) return <Notice tone="warn">Stopped after scheduling {job.done} of {job.total}.</Notice>;

  const subject = job.done === 1 ? "It sends" : "The last one sends";
  const last = job.lastSendAt === null ? "" : ` ${subject} ${formatSendTime(job.lastSendAt, now)}.`;
  return <Notice tone="good">Scheduled {job.done} {job.done === 1 ? "message" : "messages"}.{last}</Notice>;
}

/** The main form: pick a message and an interval, see the exact send times, then queue them. */
export function ScheduleTab({ tabId, now, limit, current, queue, job, sendsAvailable, refillMs }: ScheduleTabProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [override, setOverride] = useState<Target | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [chosenMode, setChosenMode] = useState<StartMode | null>(null);
  const [delayMin, setDelayMin] = useState<number | null>(null);
  const [clock, setClock] = useState("");

  useEffect(() => {
    void loadDraft().then(setDraft);
  }, []);

  if (!draft) return null;

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void saveDraft(next);
  };

  const target = override ?? current;
  const intervalMs = spacingMs(draft.intervalMin, draft.bufferSec);
  // By default the first send waits one full gap, as if the command had just been run by hand.
  const defaultDelayMin = Math.ceil(intervalMs / 60_000);
  const slotsFree = Math.max(0, limit - queue.length);
  const lastQueued = target ? lastQueuedAt(queue, target.channelId, draft.content) : null;

  // Carry on from an existing run unless told otherwise, so topping up can't break the cooldown.
  const mode: StartMode =
    chosenMode === "after-last" && lastQueued === null ? "delay" : (chosenMode ?? (lastQueued !== null ? "after-last" : "delay"));
  const start: StartChoice =
    mode === "time"
      ? { mode, time: clock }
      : mode === "after-last"
        ? { mode }
        : { mode: "delay", minutes: delayMin ?? defaultDelayMin };

  const planFor = (at: number) =>
    buildPlan({
      now: at,
      first: resolveFirstSend(start, at, lastQueued, intervalMs),
      intervalMs,
      count,
      slotsFree,
    });

  const plan = mode === "time" && clock === "" ? null : planFor(now);
  const times = plan?.times ?? [];
  const canSchedule = target !== null && draft.content.trim() !== "" && times.length > 0 && !job.running;

  const heldBack = Math.max(0, times.length - sendsAvailable);

  const schedule = () => {
    if (!canSchedule) return;
    // Recalculate at the moment of the click: the preview can be up to a second old.
    const fresh = planFor(Date.now());
    void callPage(tabId, "start", { channelId: target.channelId, content: draft.content, times: fresh.times });
    const run: RecentRun = { ...target, content: draft.content, intervalMin: draft.intervalMin, bufferSec: draft.bufferSec };
    update({ recents: addRecent(draft.recents, run) });
  };

  const applyRecent = (run: RecentRun) => {
    setOverride(run);
    update({ content: run.content, intervalMin: run.intervalMin, bufferSec: run.bufferSec });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The form scrolls on its own, since Chrome caps popups at 600px and the footer must stay in view. */}
      <div className="-mx-0.5 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-0.5 py-0.5 [scrollbar-width:thin]">
      <section>
        <FieldLabel
          aside={
            override && current && override.channelId !== current.channelId ? (
              <button type="button" className="text-accent hover:underline" onClick={() => setOverride(null)}>
                Use open channel
              </button>
            ) : null
          }
        >
          Send to
        </FieldLabel>
        <div className="bg-panel rounded-lg px-3 py-2">
          {target ? (
            <>
              <div className="flex font-medium">
                <TargetName {...target} />
              </div>
              <div className="text-muted truncate text-xs">{target.guildName ?? "Direct message"}</div>
            </>
          ) : (
            <div className="text-muted text-xs">Open a channel in Discord{draft.recents.length > 0 ? ", or pick a recent one below" : ""}.</div>
          )}
        </div>

        {draft.recents.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {draft.recents.map(r => (
              <button
                key={`${r.channelId}:${r.content}`}
                type="button"
                title={`${r.guildName ?? "Direct message"}, every ${formatInterval(spacingMs(r.intervalMin, r.bufferSec))}`}
                className="bg-panel text-muted hover:bg-field hover:text-ink max-w-full truncate rounded-md px-2 py-1 text-xs"
                onClick={() => applyRecent(r)}
              >
                {r.content} in {r.guildName ? "#" : "@"}
                {r.channelName}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <FieldLabel>Message</FieldLabel>
        <textarea
          aria-label="Message"
          autoFocus
          placeholder="What should it send?"
          rows={1}
          maxLength={2000}
          value={draft.content}
          onChange={e => update({ content: e.target.value })}
          className="bg-field focus:outline-accent field-sizing-content block max-h-24 w-full resize-none rounded-lg px-3 py-2 outline-none focus:outline-2"
        />
      </section>

      <section className="grid grid-cols-3 gap-2">
        <div>
          <FieldLabel>Every (min)</FieldLabel>
          <Stepper
            label="Interval in minutes"
            value={draft.intervalMin}
            min={1}
            max={OPTIONS.maxIntervalMin}
            onChange={intervalMin => update({ intervalMin })}
          />
        </div>
        <div>
          <FieldLabel>+ Buffer (sec)</FieldLabel>
          <Stepper
            label="Extra seconds added to every gap"
            value={draft.bufferSec}
            min={0}
            max={OPTIONS.maxBufferSec}
            step={OPTIONS.bufferStepSec}
            onChange={bufferSec => update({ bufferSec })}
          />
        </div>
        <div>
          <FieldLabel
            aside={
              count !== null && (
                <button type="button" className="text-accent hover:underline" onClick={() => setCount(null)}>
                  Max
                </button>
              )
            }
          >
            How many
          </FieldLabel>
          <Stepper label="Number of messages" value={count ?? slotsFree} min={0} max={limit} onChange={setCount} />
        </div>
      </section>

      <section>
        <FieldLabel>First send</FieldLabel>
        <div className="flex gap-2.5">
          <div role="radiogroup" aria-label="First send" className="bg-field flex h-9 flex-1 rounded-lg p-0.5">
            {START_MODES.map(m => (
              <button
                key={m.mode}
                type="button"
                role="radio"
                aria-checked={mode === m.mode}
                disabled={m.mode === "after-last" && lastQueued === null}
                className={`flex-1 rounded-md px-1 text-xs font-medium disabled:opacity-30 ${
                  mode === m.mode ? "bg-accent text-white" : "text-muted hover:text-ink"
                }`}
                onClick={() => setChosenMode(m.mode)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === "delay" && (
            <div className="w-[7.5rem]">
              <Stepper label="Minutes until first send" value={delayMin ?? defaultDelayMin} min={1} max={OPTIONS.maxIntervalMin} suffix="min" onChange={setDelayMin} />
            </div>
          )}
          {mode === "time" && (
            <input
              aria-label="Time of first send"
              type="time"
              value={clock}
              onChange={e => setClock(e.target.value)}
              className="bg-field h-9 w-[7.5rem] rounded-lg px-2 tabular-nums"
            />
          )}
        </div>
      </section>

      <section>
        <FieldLabel aside={times.length > 1 && <span>{formatInterval(intervalMs)} apart, over {formatDuration(times.at(-1)! - times[0]!)}</span>}>
          Send times
        </FieldLabel>
        {times.length > 0 ? (
          <ol className="bg-panel max-h-28 overflow-y-auto rounded-lg py-1">
            {times.map((t, i) => (
              <li key={t} className="flex items-baseline gap-2 px-3 py-0.5 tabular-nums">
                <span className="text-faint w-4 text-right text-xs">{i + 1}</span>
                <span className="flex-1">{formatSendTime(t, now)}</span>
                <span className="text-muted text-xs">in {formatDuration(t - now)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="bg-panel text-muted rounded-lg px-3 py-2 text-xs">
            {slotsFree === 0 ? `All ${limit} slots are taken. Cancel some in Queued, or wait for them to send.` : mode === "time" && !clock ? "Pick a time." : "Nothing to schedule."}
          </p>
        )}
      </section>

      </div>

      <footer className="flex shrink-0 flex-col gap-2 pt-3">
        {plan?.firstMoved && (
          <Notice tone="warn">Discord needs {RULES.minLeadMs / 60_000} minutes' notice, so the first send was moved to the earliest allowed time.</Notice>
        )}
        {plan?.cappedBySlots && slotsFree > 0 && <Notice tone="warn">Only {slotsFree} of your {limit} slots are free.</Notice>}
        {plan?.cappedByHorizon && <Notice tone="warn">Discord only schedules up to 8 days ahead, so the run stops there.</Notice>}
        {!job.running && heldBack > 0 && (
          <Notice tone="warn">
            Discord limits how fast these can be created. {sendsAvailable > 0 ? `${sendsAvailable} go now, then` : "From now,"} one every {formatDuration(refillMs)}, so this takes about{" "}
            {formatDuration(heldBack * refillMs)}. Keep the Discord tab open until it's done.
          </Notice>
        )}
        {job.running && job.waitingUntil !== null && (
          <Notice tone="warn">
            Waiting on Discord's rate limit: next in {formatInterval(job.waitingUntil - now)}, about {formatDuration((job.total - job.done) * refillMs)} left in total. Keep the Discord tab open. You can close this popup.
          </Notice>
        )}
        <JobResult job={job} now={now} />

        {job.running ? (
          <div className="bg-panel flex h-10 items-center gap-3 rounded-lg px-3">
            <div className="bg-field h-1.5 flex-1 overflow-hidden rounded-full">
              <div className="bg-accent h-full transition-[width]" style={{ width: `${(job.done / Math.max(job.total, 1)) * 100}%` }} />
            </div>
            <span className="text-xs tabular-nums">
              {job.done}/{job.total}
            </span>
            <button type="button" className="text-bad text-xs font-medium hover:underline" onClick={() => void callPage(tabId, "stop")}>
              Stop
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!canSchedule}
            className="bg-accent hover:bg-accent-hover disabled:hover:bg-accent h-10 rounded-lg font-medium text-white disabled:opacity-40"
            onClick={schedule}
          >
            Schedule {times.length} {times.length === 1 ? "message" : "messages"}
          </button>
        )}
      </footer>
    </div>
  );
}
