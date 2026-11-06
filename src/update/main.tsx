import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { checkFolder, findUpdate, installZip, UpdateError, type Release } from "../lib/update";
import "../popup/style.css";
import { forgetSavedFolder, loadSavedFolder, saveFolder } from "./savedFolder";

// Runs in its own tab because the folder picker and permission prompt would close the popup, and
// because a tab survives long enough to finish writing files.

type FolderPermission = "granted" | "denied" | "prompt";
type PermissionMode = { mode: "readwrite" };

// Not in TypeScript's DOM types yet, and missing entirely in browsers without this API, such as Brave by default.
declare global {
  interface Window {
    showDirectoryPicker?(options: PermissionMode & { id: string }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    queryPermission(options: PermissionMode): Promise<FolderPermission>;
    requestPermission(options: PermissionMode): Promise<FolderPermission>;
  }
}

type Stage =
  | { name: "checking" }
  | { name: "latest" }
  | { name: "manual"; release: Release }
  | { name: "ready"; release: Release; error?: string }
  | { name: "working"; label: string };

const READ_WRITE: PermissionMode = { mode: "readwrite" };

function describeError(error: unknown) {
  if (error instanceof UpdateError) return error.message;
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
}

function App() {
  const { name, version } = chrome.runtime.getManifest();
  const [stage, setStage] = useState<Stage>({ name: "checking" });
  const started = useRef(false);

  async function install(folder: FileSystemDirectoryHandle, release: Release) {
    try {
      setStage({ name: "working", label: "Checking the folder…" });
      try {
        await checkFolder(folder, { name, version });
      } catch (error) {
        // A saved folder can move or be replaced, so the next try has to ask again.
        await forgetSavedFolder();
        throw error;
      }
      await saveFolder(folder);

      setStage({ name: "working", label: `Downloading v${release.version}…` });
      const response = await fetch(release.zipUrl);
      if (!response.ok) throw new UpdateError(`The download failed (GitHub answered ${response.status}). Try again.`);
      const zip = new Uint8Array(await response.arrayBuffer());

      setStage({ name: "working", label: "Installing…" });
      await installZip(folder, zip, { name, version: release.version });

      setStage({ name: "working", label: "Restarting…" });
      chrome.runtime.reload();
    } catch (error) {
      setStage({ name: "ready", release, error: describeError(error) });
    }
  }

  // --- Skip the click if the folder is already known and still allowed ---
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function start() {
      const release = await findUpdate();
      if (!release) return setStage({ name: "latest" });
      if (!window.showDirectoryPicker) return setStage({ name: "manual", release });

      const saved = await loadSavedFolder();
      if (saved && (await saved.queryPermission(READ_WRITE)) === "granted") return install(saved, release);
      setStage({ name: "ready", release });
    }

    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpdate(release: Release) {
    try {
      const saved = await loadSavedFolder();
      if (saved && (await saved.requestPermission(READ_WRITE)) === "granted") return await install(saved, release);

      // If this folder was refused, the picker below replaces it.
      const folder = await window.showDirectoryPicker!({ ...READ_WRITE, id: "extension-folder" });
      await install(folder, release);
    } catch (error) {
      // Cancelling the picker isn't a problem worth reporting.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStage({ name: "ready", release, error: describeError(error) });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 py-10">
      <h1 className="text-lg font-semibold">{stage.name === "latest" ? `${name} is up to date` : `Update ${name}`}</h1>

      {stage.name === "checking" && <p className="text-muted">Checking for updates…</p>}
      {stage.name === "working" && <p className="text-muted">{stage.label} Keep this tab open.</p>}
      {stage.name === "latest" && <p className="text-muted">You're on v{version}. You can close this tab.</p>}

      {stage.name === "ready" && (
        <>
          <p className="text-muted leading-relaxed">
            v{stage.release.version} is ready (you're on v{version}). The first time, choose your {name} folder, the one you picked in Load unpacked, and
            allow changes to it. The extension then replaces its own files and restarts.
          </p>
          {stage.error && <p className="text-bad leading-relaxed">{stage.error}</p>}
          <button
            type="button"
            className="bg-accent hover:bg-accent-hover mt-1 self-start rounded-lg px-4 py-2 font-medium text-white"
            onClick={() => void onUpdate(stage.release)}
          >
            Update to v{stage.release.version}
          </button>
        </>
      )}

      {stage.name === "manual" && (
        <>
          <p className="text-muted leading-relaxed">
            This browser doesn't let extensions update their own files, so v{stage.release.version} needs a quick manual install:
          </p>
          <ol className="text-muted list-inside list-decimal space-y-1 leading-relaxed">
            <li>
              <a className="text-accent-soft underline" href={stage.release.zipUrl}>
                Download the new zip
              </a>{" "}
              and unzip it.
            </li>
            <li>Replace the contents of your {name} folder with the new files.</li>
            <li>Click the reload icon on {name} in chrome://extensions.</li>
          </ol>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
