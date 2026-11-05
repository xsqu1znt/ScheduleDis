import { useEffect, useState } from "react";
import { callPage, findDiscordTab, injectPageScript } from "../lib/bridge";
import type { Snapshot } from "../lib/types";

export type Connection =
  | { state: "connecting" }
  | { state: "no-tab" }
  | { state: "error"; message: string }
  | { state: "connected"; tabId: number; snapshot: Snapshot };

const POLL_MS = 1000;

/** Connects to the Discord tab and keeps its state fresh while the popup is open. */
export function usePage() {
  const [connection, setConnection] = useState<Connection>({ state: "connecting" });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let closed = false;

    async function run() {
      const tabId = await findDiscordTab();
      if (closed) return;
      if (tabId === null) return setConnection({ state: "no-tab" });

      let refreshed = false;
      async function poll(tabId: number) {
        try {
          await injectPageScript(tabId);
          const snapshot = await callPage(tabId, "snapshot");
          if (closed) return;
          setConnection({ state: "connected", tabId, snapshot });

          if (snapshot.status === "ready" && !refreshed) {
            refreshed = true;
            void callPage(tabId, "refresh");
          }
        } catch (error) {
          if (closed) return;
          setConnection({ state: "error", message: error instanceof Error ? error.message : String(error) });
        }
        timer = setTimeout(() => void poll(tabId), POLL_MS);
      }
      await poll(tabId);
    }

    void run();
    return () => {
      closed = true;
      clearTimeout(timer);
    };
  }, []);

  return connection;
}
