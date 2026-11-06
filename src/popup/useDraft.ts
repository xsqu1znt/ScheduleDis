import { useCallback, useEffect, useState } from "react";
import { loadDraft, saveDraft, type Draft } from "../lib/storage";

/** The saved form values and presets. Null until storage has loaded. */
export function useDraft() {
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    void loadDraft().then(setDraft);
  }, []);

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft(current => {
      if (!current) return current;
      const next = { ...current, ...patch };
      void saveDraft(next);
      return next;
    });
  }, []);

  return [draft, update] as const;
}
