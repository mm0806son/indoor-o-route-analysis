"use client";
import type { RaceCourseData } from "@indoor-o-route-analysis/core";
export default function StairSelector({
  race,
  value,
  onChange,
  allowAll = false,
}: {
  allowAll?: boolean;
  race?: RaceCourseData;
  value: string;
  onChange: (code: string) => void;
}) {
  const codes = [
    ...new Set(
      (race?.vertices ?? []).flatMap((n) =>
        n.stair ? [n.stair.code.toUpperCase()] : [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return (
    <label className="text-xs flex items-center gap-2 p-2">
      Stair highlight
      <select
        aria-label="Stair highlight"
        className="bg-background border rounded p-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">None</option>
        {allowAll && <option value="*">All stairs</option>}
        {codes.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
