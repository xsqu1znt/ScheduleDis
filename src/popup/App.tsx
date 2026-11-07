import { useState } from "react";
import { DISCORD_APP_URL } from "../lib/bridge";
import { BASE_SLOTS } from "../lib/plan";
import type { Preset } from "../lib/storage";
import { PresetsTab } from "./PresetsTab";
import { QueueTab } from "./QueueTab";
import { EMPTY_FORM, ScheduleTab, type ScheduleForm } from "./ScheduleTab";
import { UpdateButton } from "./UpdateButton";
import { useDraft } from "./useDraft";
import { usePage } from "./usePage";

type Tab = "schedule" | "presets" | "queued";

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="relative px-5 py-8 text-center">
      <UpdateButton className="absolute top-2.5 right-2.5" />
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted mt-1.5 text-xs leading-relaxed">{children}</div>}
    </div>
  );
}

export function App() {
  const connection = usePage();
  const [draft, update] = useDraft();
  const [tab, setTab] = useState<Tab>("schedule");
  const [form, setFormState] = useState<ScheduleForm>(EMPTY_FORM);

  if (connection.state === "connecting") return <Message title="Connecting to Discord…" />;
  if (connection.state === "error") return <Message title="Couldn't reach the Discord tab">{connection.message}</Message>;
  if (connection.state === "no-tab") {
    return (
      <Message title="Discord isn't open">
        <button type="button" className="bg-accent mt-2 rounded-lg px-4 py-2 font-medium text-white" onClick={() => void chrome.tabs.create({ url: DISCORD_APP_URL })}>
          Open Discord
        </button>
      </Message>
    );
  }

  const { snapshot, tabId } = connection;
  if (snapshot.status === "loading") return <Message title="Waiting for Discord to load…">Log in if you haven't yet.</Message>;
  if (snapshot.status === "unsupported") {
    return <Message title="Discord changed something this extension relies on">Couldn't find: {snapshot.missing}</Message>;
  }
  if (snapshot.limit === 0) {
    return <Message title="Scheduled messages aren't on for this account">Discord rolls this feature out per account.</Message>;
  }
  if (!draft) return null;

  const now = Date.now();
  const setForm = (patch: Partial<ScheduleForm>) => setFormState(current => ({ ...current, ...patch }));

  const loadPreset = (p: Preset) => {
    const { channelId, channelName, guildName } = p;
    setForm({ override: { channelId, channelName, guildName }, count: Math.min(p.count, snapshot.limit), chosenMode: null, delayMin: null });
    update({ content: p.content, intervalMin: p.intervalMin, bufferOn: p.bufferSec > 0, ...(p.bufferSec > 0 && { bufferSec: p.bufferSec }) });
    setTab("schedule");
  };

  const tabButton = (t: Tab, label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      className={`-mb-px border-b-2 px-0.5 pb-2 font-medium ${tab === t ? "border-accent text-ink" : "text-muted hover:text-ink border-transparent"}`}
      onClick={() => setTab(t)}
    >
      {label}
      {count ? <span className="text-faint ml-1.5 text-[11px]">{count}</span> : null}
    </button>
  );

  return (
    <div className="relative isolate flex max-h-[600px] flex-col overflow-hidden">
      <header className="border-line relative z-10 mx-3.5 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b pt-3">
        <div role="tablist" aria-label="ScheduleDis" className="flex w-full gap-4 min-[440px]:w-auto">
          {tabButton("schedule", "Schedule")}
          {tabButton("presets", "Presets", draft.presets.length)}
          {tabButton("queued", "Queued", snapshot.queue.length)}
        </div>
        <span className="text-muted flex items-center gap-1.5 pb-2 text-xs tabular-nums min-[440px]:ml-auto">
          {snapshot.limit > BASE_SLOTS && <img src="icons/nitro.png" alt="Nitro" className="size-4" />}
          {snapshot.queue.length} of {snapshot.limit} slots
        </span>
        <UpdateButton className="mb-1.5 ml-auto min-[440px]:ml-0" />
      </header>

      {tab === "schedule" && (
        <ScheduleTab
          tabId={tabId}
          now={now}
          limit={snapshot.limit}
          current={snapshot.current}
          queue={snapshot.queue}
          job={snapshot.job}
          sendsAvailable={snapshot.sendsAvailable}
          refillMs={snapshot.refillMs}
          draft={draft}
          update={update}
          form={form}
          setForm={setForm}
          onOpenQueued={() => setTab("queued")}
        />
      )}
      {tab === "presets" && (
        <PresetsTab presets={draft.presets} onLoad={loadPreset} onRemove={p => update({ presets: draft.presets.filter(other => other !== p) })} />
      )}
      {tab === "queued" && <QueueTab tabId={tabId} now={now} queue={snapshot.queue} loaded={snapshot.queueLoaded} />}
    </div>
  );
}
