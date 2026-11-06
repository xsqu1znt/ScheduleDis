import { useEffect, useState } from "react";
import { findUpdate, type Release } from "../lib/update";
import { DownloadIcon } from "./icons";

/** Shows when a newer release exists and opens the update page. Renders nothing otherwise. */
export function UpdateButton({ className = "" }: { className?: string }) {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    let closed = false;
    void findUpdate().then(found => {
      if (!closed) setRelease(found);
    });
    return () => {
      closed = true;
    };
  }, []);

  if (!release) return null;

  return (
    <button
      type="button"
      title={`Update to v${release.version}`}
      className={`bg-accent hover:bg-accent-hover flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white ${className}`}
      onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL("update.html") })}
    >
      <DownloadIcon />
      Update
    </button>
  );
}
