"use client";
import { useState } from "react";
import { useAppData } from "@indoor-o-route-analysis/ui";
import type { RaceCourseData } from "@indoor-o-route-analysis/core";

const history: {
  current: { id: string; before: RaceCourseData; after: RaceCourseData }[];
} = { current: [] };
const future: typeof history = { current: [] };

// Local operation history is invalidated by changes from other editors.
export function useStairData() {
  const { selectedEvent, updateEventData } = useAppData();
  const race = selectedEvent?.raceCourses?.[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const same = (a: RaceCourseData, b: RaceCourseData) => a === b;
  const commit = async (next: RaceCourseData, record = true) => {
    if (!selectedEvent || !race || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateEventData(selectedEvent.id, {
        raceCourses: [next, ...(selectedEvent.raceCourses ?? []).slice(1)],
      });
      if (record) {
        history.current.push({
          id: selectedEvent.id,
          before: race,
          after: next,
        });
        history.current = history.current.slice(-30);
        future.current = [];
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const last = history.current.at(-1),
    redo = future.current.at(-1);
  const canUndo = !!(
    race &&
    last &&
    last.id === selectedEvent?.id &&
    same(race, last.after)
  );
  const canRedo = !!(
    race &&
    redo &&
    redo.id === selectedEvent?.id &&
    same(race, redo.before)
  );
  return {
    race,
    commit,
    busy,
    error,
    canUndo,
    canRedo,
    undo: async () => {
      if (canUndo && last) {
        await commit(last.before, false);
        history.current.pop();
        future.current.push(last);
      }
    },
    redo: async () => {
      if (canRedo && redo) {
        await commit(redo.after, false);
        future.current.pop();
        history.current.push(redo);
      }
    },
  };
}
