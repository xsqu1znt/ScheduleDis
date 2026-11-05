import { useState } from "react";
import { DISCORD_APP_URL } from "../lib/bridge";
import { QueueTab } from "./QueueTab";
import { ScheduleTab } from "./ScheduleTab";
import { usePage } from "./usePage";

type Tab = "schedule" | "queued";

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted mt-1.5 text-xs leading-relaxed">{children}</div>}
    </div>
  );
}

export function App() {
  const connection = usePage();
  const [tab, setTab] = useState<Tab>("schedule");

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

  const now = Date.now();
  const tabClass = (t: Tab) =>
    `-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${tab === t ? "border-accent text-ink" : "text-muted hover:text-ink border-transparent"}`;

  return (
    <div className="flex max-h-[600px] flex-col p-3.5">
      <header className="border-line mb-3.5 flex shrink-0 items-center gap-4 border-b">
        <button type="button" className={tabClass("schedule")} onClick={() => setTab("schedule")}>
          Schedule
        </button>
        <button type="button" className={tabClass("queued")} onClick={() => setTab("queued")}>
          Queued
        </button>
        <span className="text-muted ml-auto pb-2 text-xs tabular-nums">
          {snapshot.queue.length} of {snapshot.limit} slots used
        </span>
      </header>

      {tab === "schedule" ? (
        <ScheduleTab tabId={tabId} now={now} limit={snapshot.limit} current={snapshot.current} queue={snapshot.queue} job={snapshot.job} sendsAvailable={snapshot.sendsAvailable} refillMs={snapshot.refillMs} />
      ) : (
        <QueueTab tabId={tabId} now={now} queue={snapshot.queue} loaded={snapshot.queueLoaded} />
      )}
    </div>
  );
}
