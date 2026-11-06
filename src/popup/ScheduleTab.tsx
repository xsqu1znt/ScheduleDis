import { useRef, useState } from "react";
import { callPage } from "../lib/bridge";
import { formatClock, formatDay, formatDuration, formatInterval, formatSendTime } from "../lib/format";
import { BASE_SLOTS, buildPlan, lastQueuedAt, MIN_FIRST_SEND_MIN, resolveFirstSend, spacingMs, type StartChoice } from "../lib/plan";
import { BUFFER, isPresetSaved, togglePreset, type Draft, type Preset } from "../lib/storage";
import type { JobStatus, QueuedMessage, Target } from "../lib/types";
import { FieldLabel, Reveal, Slider, Stepper } from "./controls";
import { Dock, type Alert } from "./Dock";
import { ChevronIcon } from "./icons";
import { NitroFx } from "./NitroFx";

type StartMode = StartChoice["mode"];

/** What the form holds beyond the saved draft. Lives in App so it survives switching tabs. */
export interface ScheduleForm {
  /** A preset's channel, shown instead of the open one. */
  override: Target | null;
  /** Null means untouched: the default count, or as many as fit if fewer are free. */
  count: number | null;
  chosenMode: Exclude<StartMode, "after-last"> | null;
  delayMin: number | null;
  clock: string;
}

interface ScheduleTabProps {
  tabId: number;
  now: number;
  limit: number;
  current: Target | null;
  queue: QueuedMessage[];
  job: JobStatus;
  sendsAvailable: number;
  refillMs: number;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  form: ScheduleForm;
  setForm: (patch: Partial<ScheduleForm>) => void;
  onOpenQueued: () => void;
}

export const EMPTY_FORM: ScheduleForm = { override: null, count: null, chosenMode: null, delayMin: null, clock: "" };

const OPTIONS = {
  defaultCount: 10,
  maxIntervalMin: 24 * 60,
  // A finished run's result stays on screen this long, in case the popup was closed while it ran.
  resultVisibleMs: 5 * 60_000,
} as const;

const OVERLAP_NOTE = "A schedule for this message is already queued, so this could land inside it";

const START_TABS: { mode: StartMode; label: string }[] = [
  { mode: "delay", label: "After a wait" },
  { mode: "time", label: "At a set time" },
  { mode: "after-last", label: "After last schedule" },
];

function toTimeInput(at: number) {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function jobResultAlert(job: JobStatus, now: number): Alert | null {
  if (job.running || job.finishedAt === null || now - job.finishedAt > OPTIONS.resultVisibleMs) return null;
  if (job.error) return { tone: "bad", text: `Scheduled ${job.done} of ${job.total}, then stopped: ${job.error}` };
  if (job.done < job.total) return { tone: "warn", text: `Stopped after ${job.done} of ${job.total}.` };

  const last = job.lastSendAt === null ? "" : ` The last sends ${formatSendTime(job.lastSendAt, now).replace("Tomorrow", "tomorrow")}.`;
  return { tone: "good", text: `Scheduled ${job.done} ${job.done === 1 ? "message" : "messages"}.${last}` };
}

/** The reveal list of send times, grouped by day when the run crosses midnight. */
function SendTimes({ times, now }: { times: number[]; now: number }) {
  const multiDay = times.length > 0 && formatDay(times[0]!, now) !== formatDay(times.at(-1)!, now);
  let shownDay: string | null = null;

  return (
    <ol className="bg-soft mt-2 grid max-h-[124px] grid-cols-2 gap-x-3.5 overflow-x-hidden overflow-y-auto rounded-lg px-1 py-1.5 tabular-nums">
      {times.flatMap((t, i) => {
        const day = formatDay(t, now);
        const heading = multiDay && day !== shownDay;
        shownDay = day;
        const row = (
          <li key={t} className="flex items-baseline gap-1.5 px-2 py-0.5 text-[13px] whitespace-nowrap">
            <span className="text-faint w-4 text-right text-[11px]">{i + 1}</span>
            {formatClock(t)}
            <span className="text-muted ml-auto text-[11px]">in {formatDuration(t - now)}</span>
          </li>
        );
        if (!heading) return [row];
        return [
          <li key={`day-${day}`} className="text-faint col-span-full px-2 pt-1.5 pb-0.5 text-[11px] font-semibold first:pt-0">
            {day}
          </li>,
          row,
        ];
      })}
    </ol>
  );
}

/** The main form: how many, how often, and when the first goes out, with the message in a chat bar below. */
export function ScheduleTab(props: ScheduleTabProps) {
  const { tabId, now, limit, current, queue, job, sendsAvailable, refillMs, draft, update, form, setForm, onOpenQueued } = props;
  const [showTimes, setShowTimes] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const target = form.override ?? current;
  const bufferSec = draft.bufferOn ? draft.bufferSec : 0;
  const intervalMs = spacingMs(draft.intervalMin, bufferSec);
  const delayMin = form.delayMin ?? Math.max(MIN_FIRST_SEND_MIN, Math.ceil(intervalMs / 60_000));
  const slotsFree = Math.max(0, limit - queue.length);
  const count = form.count ?? Math.min(OPTIONS.defaultCount, slotsFree);
  const lastQueued = target ? lastQueuedAt(queue, target.channelId, draft.content) : null;
  const hasLast = lastQueued !== null;

  // Once this message is queued, only carrying on from it is safe: anything else could land inside that run and break the cooldown.
  const mode: StartMode = hasLast ? "after-last" : (form.chosenMode ?? "delay");
  const start: StartChoice = mode === "time" ? { mode, time: form.clock } : mode === "after-last" ? { mode } : { mode: "delay", minutes: delayMin };

  const planFor = (at: number) =>
    buildPlan({ now: at, first: resolveFirstSend(start, at, lastQueued, intervalMs), intervalMs, count, slotsFree });

  const plan = mode === "time" && form.clock === "" ? null : planFor(now);
  const times = plan?.times ?? [];
  const canSchedule = target !== null && draft.content.trim() !== "" && times.length > 0 && !job.running;

  // --- Nitro effect: builds as the run goes past what an account without Nitro could do ---
  const runSize = job.running ? job.total : times.length;
  const nitro = limit > BASE_SLOTS;
  const fxLevel = nitro && runSize > BASE_SLOTS ? (runSize - BASE_SLOTS) / (limit - BASE_SLOTS) : -1;

  // --- Slider. One or no free slots use a 0 to 1 range, since a range with min equal to max parks its thumb on the left ---
  const countMax = Math.max(1, slotsFree);
  const countMin = slotsFree <= 1 ? 0 : 1;
  const countValue = Math.min(count, countMax);

  // --- Preset for the current setup ---
  const preset: Preset | null =
    target && draft.content.trim() !== ""
      ? { ...target, content: draft.content, count: Math.max(1, count), intervalMin: draft.intervalMin, bufferSec }
      : null;

  // --- Alerts: only what actually needs attention ---
  const alerts: Alert[] = [];
  const result = jobResultAlert(job, now);
  if (result) alerts.push(result);
  if (!job.running) {
    if (mode === "time" && form.clock === "") alerts.push({ tone: "warn", text: "Pick a time for the first message." });
    if (slotsFree === 0) {
      alerts.push({
        tone: "warn",
        text: (
          <>
            All {limit} slots are taken. Cancel some in{" "}
            <button type="button" className="font-semibold underline underline-offset-2 hover:text-white" onClick={onOpenQueued}>
              Queued
            </button>
            .
          </>
        ),
      });
    } else if (plan?.cappedBySlots) {
      alerts.push({ tone: "warn", text: `Only ${slotsFree} of your ${limit} slots are free, so ${slotsFree} will schedule.` });
    }
    if (plan?.firstMoved && times[0] !== undefined) alerts.push({ tone: "warn", text: `Moved to ${formatSendTime(times[0], now)}, the earliest Discord allows.` });
    if (plan?.cappedByHorizon) alerts.push({ tone: "warn", text: "Stops at 8 days out, the furthest Discord allows." });
  }

  const schedule = () => {
    if (!canSchedule) return;
    // Recalculate at the moment of the click: the preview can be up to a second old.
    const fresh = planFor(Date.now());
    void callPage(tabId, "start", { channelId: target.channelId, content: draft.content, times: fresh.times });
    setForm({ count: null });
    setBurstKey(k => k + 1);
  };

  const chooseMode = (next: StartMode) => {
    if (next === "after-last") return;
    // A set time always opens filled in, using when the wait would have landed, so it's never a blank field.
    setForm(next === "time" && form.clock === "" ? { chosenMode: next, clock: toTimeInput(Math.ceil((now + delayMin * 60_000) / 60_000) * 60_000) } : { chosenMode: next });
  };

  const firstAt = times[0];
  const lastAt = times.at(-1);
  const useOpenChannel = form.override && current && form.override.channelId !== current.channelId ? () => setForm({ override: null }) : null;

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${fxLevel >= 0 ? "nitro-active" : ""}`}>
      <NitroFx level={fxLevel} barRef={barRef} burstKey={burstKey} />

      {/* The form scrolls on its own, since Chrome caps popups at 600px and the chat bar must stay in view. */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3.5">
        <section>
          <FieldLabel
            aside={
              slotsFree === 0 ? (
                "No slots free"
              ) : (
                <>
                  <b className="text-ink text-[13px] font-medium">{countValue}</b> of {slotsFree}
                  {slotsFree < limit ? " free" : ""}
                </>
              )
            }
          >
            How many
          </FieldLabel>
          <div className={slotsFree === 0 ? "opacity-40" : ""}>
            <Slider
              label="Number of messages"
              value={countValue}
              min={countMin}
              max={countMax}
              nitroFrom={nitro ? BASE_SLOTS : undefined}
              disabled={slotsFree <= 1}
              onChange={value => setForm({ count: value })}
            />
          </div>
        </section>

        <section>
          <FieldLabel
            aside={
              draft.bufferOn && (
                <>
                  <b className="text-ink text-[13px] font-medium">{formatInterval(intervalMs)}</b> apart
                </>
              )
            }
          >
            Every
          </FieldLabel>
          <div className="bg-field relative z-10 flex h-9 overflow-hidden rounded-lg">
            <Stepper label="Minutes between messages" value={draft.intervalMin} min={1} max={OPTIONS.maxIntervalMin} suffix="min" onChange={intervalMin => update({ intervalMin })} />
            <button
              type="button"
              aria-expanded={draft.bufferOn}
              title="Extra time added to every gap"
              className={`border-canvas w-[84px] shrink-0 border-l text-xs font-medium transition-colors ${
                draft.bufferOn ? "bg-accent hover:bg-accent-hover text-white" : "text-muted hover:bg-field-hover hover:text-ink"
              }`}
              onClick={() => update({ bufferOn: !draft.bufferOn })}
            >
              Buffer
            </button>
          </div>
          <Reveal open={draft.bufferOn} extension>
            <div className="extension-body text-muted flex items-center gap-2.5 px-3 pb-1 text-xs">
              <span>Buffer</span>
              <div className="min-w-0 flex-1">
                <Slider label="Buffer seconds added to every gap" value={draft.bufferSec} min={BUFFER.minSec} max={BUFFER.maxSec} step={BUFFER.stepSec} thumb={14} onChange={sec => update({ bufferSec: sec })} />
              </div>
              <output className="text-ink w-11 shrink-0 text-right font-medium tabular-nums">{draft.bufferSec} sec</output>
            </div>
          </Reveal>
        </section>

        <section>
          <FieldLabel
            aside={
              firstAt !== undefined && (
                <>
                  <b className="text-ink text-[13px] font-medium">{formatSendTime(firstAt, now)}</b>, in{" "}
                  {/* Rounded down so a wait of 11 min reads "in 11m", though sends land on the next whole minute. */}
                  {formatDuration(Math.floor((firstAt - now) / 60_000) * 60_000)}
                </>
              )
            }
          >
            First message sends
          </FieldLabel>
          <div className="bg-soft rounded-[10px] p-1">
            <div role="tablist" aria-label="First message sends" className="grid grid-cols-3 gap-0.5">
              {START_TABS.map(t => {
                const disabled = t.mode === "after-last" ? !hasLast : hasLast;
                const selected = mode === t.mode;
                return (
                  <button
                    key={t.mode}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={disabled}
                    title={disabled ? (t.mode === "after-last" ? "Nothing is queued for this message yet" : OVERLAP_NOTE) : undefined}
                    className={`h-[30px] rounded-[7px] text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed ${
                      selected ? "bg-accent text-white" : "text-muted hover:not-disabled:bg-softer hover:not-disabled:text-ink disabled:opacity-35"
                    }`}
                    onClick={() => chooseMode(t.mode)}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex pt-1">
              {mode === "delay" && <Stepper label="Minutes until first message" value={delayMin} min={MIN_FIRST_SEND_MIN} max={OPTIONS.maxIntervalMin} suffix="min" onChange={value => setForm({ delayMin: value })} />}
              {mode === "time" && (
                <input
                  aria-label="Time of first message"
                  type="time"
                  value={form.clock}
                  onChange={e => setForm({ clock: e.target.value })}
                  className="time-input bg-field h-9 w-full rounded-lg pr-2.5 pl-3 font-medium tabular-nums"
                />
              )}
              {mode === "after-last" && (
                <div className="bg-field flex h-9 w-full items-center rounded-lg px-3 text-[13px] font-medium tabular-nums">{formatInterval(intervalMs)} after your last scheduled message</div>
              )}
            </div>
          </div>
        </section>

        {firstAt !== undefined && lastAt !== undefined && (
          <section>
            <div className="text-muted flex items-center justify-between gap-2 text-[13px]">
              <span>
                {times.length > 1 ? (
                  <>
                    Ends <b className="text-ink font-medium tabular-nums">{formatSendTime(lastAt, now).replace("Tomorrow", "tomorrow")}</b>
                  </>
                ) : (
                  "Sends once"
                )}
              </span>
              <button type="button" aria-expanded={showTimes} className="hover:text-ink flex shrink-0 items-center gap-1 text-xs font-medium hover:underline" onClick={() => setShowTimes(!showTimes)}>
                Preview times
                <ChevronIcon className={`transition-transform ${showTimes ? "rotate-180" : ""}`} />
              </button>
            </div>
            <Reveal open={showTimes}>
              <SendTimes times={times} now={now} />
            </Reveal>
          </section>
        )}
      </main>

      <Dock
        target={target}
        onUseOpenChannel={useOpenChannel}
        content={draft.content}
        onContentChange={content => update({ content })}
        saved={preset !== null && isPresetSaved(draft.presets, preset)}
        onToggleSaved={preset && (() => update({ presets: togglePreset(draft.presets, preset) }))}
        job={job}
        now={now}
        count={times.length}
        sendsAvailable={sendsAvailable}
        refillMs={refillMs}
        canSchedule={canSchedule}
        onSchedule={schedule}
        onStop={() => void callPage(tabId, "stop")}
        alerts={alerts}
        barRef={barRef}
      />
    </div>
  );
}
