import { ROUTE_ANALYSIS_COLORS } from "@indoor-o-route-analysis/core";
import { DifficultyTag } from "@/components/route-analysis/difficulty-tag";
import type { PublishedRouteMetrics } from "@/lib/published-route";
export function formatRouteTime(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
export function CandidateTable({
  metrics,
  selected,
  onSelect,
}: {
  metrics: PublishedRouteMetrics[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <table className="route-data-table candidate-table" aria-label="候选路线">
      <thead>
        <tr>
          <th>方案</th>
          <th>长度</th>
          <th>较最短</th>
          <th>时间</th>
          <th>时间差</th>
          <th>难度</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((metric, index) => (
          <tr
            key={index}
            className={selected === index ? "selected" : ""}
            onClick={() => onSelect(index)}
          >
            <td>
              <button
                type="button"
                aria-label={`选择方案 ${index + 1}`}
                aria-pressed={selected === index}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(index);
                }}
              >
                <span
                  className="route-swatch"
                  style={{
                    background:
                      ROUTE_ANALYSIS_COLORS[
                        index % ROUTE_ANALYSIS_COLORS.length
                      ],
                  }}
                />
                {index + 1}
                {index === 0 && <small>最短</small>}
              </button>
            </td>
            <td>
              {Math.round(metric.distance)}
              <small> m</small>
            </td>
            <td>
              {metric.distanceDelta > 0 ? "+" : ""}
              {Math.round(metric.distanceDelta)}
              <small> m</small>
            </td>
            <td>{formatRouteTime(metric.estimatedTime)}</td>
            <td>
              {metric.timeDelta > 0
                ? `+${formatRouteTime(metric.timeDelta)}`
                : "—"}
            </td>
            <td>
              <DifficultyTag difficulty={metric.difficulty} size="sm" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
