import { formatInterval } from "../lib/format";
import { spacingMs } from "../lib/plan";
import type { Preset } from "../lib/storage";
import { StarIcon } from "./icons";

interface PresetsTabProps {
  presets: Preset[];
  onLoad: (preset: Preset) => void;
  onRemove: (preset: Preset) => void;
}

/** Runs saved with the star in the chat bar. Loading one fills in the Schedule tab. */
export function PresetsTab({ presets, onLoad, onRemove }: PresetsTabProps) {
  if (presets.length === 0) {
    return (
      <div className="text-muted px-6 py-10 text-center text-[13px] leading-normal">
        <b className="text-ink mb-1 block text-sm font-medium">No presets yet</b>
        Set up a run, then press the{" "}
        <span className="text-warn inline-flex align-[-2px]">
          <StarIcon filled={false} />
        </span>{" "}
        in the chat bar to keep it here.
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto p-3.5">
      {presets.map(p => (
        <li key={`${p.channelId}:${p.content}`} className="bg-soft hover:bg-softer flex items-center gap-1 rounded-lg py-1 pr-2 pl-1">
          <button type="button" aria-label={`Remove preset ${p.content}`} title="Remove preset" className="star-button text-warn" onClick={() => onRemove(p)}>
            <StarIcon filled />
          </button>
          <button type="button" className="min-w-0 flex-1 p-1 text-left" onClick={() => onLoad(p)}>
            <b className="block truncate font-medium">{p.content}</b>
            <small className="text-muted block truncate text-xs">
              {p.guildName ? `#${p.channelName} · ${p.guildName}` : `@${p.channelName}`}
            </small>
          </button>
          <span className="text-muted text-xs whitespace-nowrap tabular-nums">
            {p.count} × every {formatInterval(spacingMs(p.intervalMin, p.bufferSec))}
          </span>
        </li>
      ))}
    </ul>
  );
}
