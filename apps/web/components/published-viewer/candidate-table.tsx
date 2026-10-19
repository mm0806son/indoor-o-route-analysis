import { ArrowUpDown, Brain, Repeat, Split } from 'lucide-react';
import { ROUTE_ANALYSIS_COLORS } from '@indoor-o-route-analysis/core';
import { DifficultyTag } from '@/components/route-analysis/difficulty-tag';
import type { PublishedRouteMetrics } from '@/lib/published-route';
export function formatRouteTime(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
const reasonNames: Record<string, string> = {
  simple: '简单路线',
  'fewest floors': '最少楼层',
  shortest: '最短路线',
};
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
    <ul className="candidate-route-list" aria-label="候选路线">
      {metrics.map((metric, index) => {
        const codes =
          metric.labels?.join('') ||
          metric.description.replace(/,\s*/g, '') ||
          '—';
        const reason = metric.reasons?.[0];
        const repeat =
          metric.repetitionRatio === undefined
            ? '—'
            : `${Math.round(metric.repetitionRatio * 100)}%`;
        const reasonTitle = [
          ...(metric.reasons ?? []).map((item) => reasonNames[item] ?? item),
          metric.floors === undefined ? '' : `${metric.floors} 个楼层`,
          metric.nearbyVariants === undefined
            ? ''
            : `${metric.nearbyVariants} 条相近方案`,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={index}>
            <button
              type="button"
              className={`candidate-route-card ${selected === index ? 'selected' : ''}`}
              aria-label={`选择方案 ${index + 1}`}
              aria-pressed={selected === index}
              onClick={() => onSelect(index)}
            >
              <span
                className="route-color-dot"
                style={{
                  background:
                    ROUTE_ANALYSIS_COLORS[index % ROUTE_ANALYSIS_COLORS.length],
                }}
              />
              <span className="route-card-content">
                <span className="route-card-heading">
                  <span className="route-card-name">
                    <span title={`路线编码：${codes}`}>
                      Route {index + 1}: {codes}
                    </span>
                    {reason && (
                      <span className="route-auto-label" title={reasonTitle}>
                        {reason}
                      </span>
                    )}
                  </span>
                  <span className="route-card-timing">
                    <span title="路线长度">
                      {Math.round(metric.distance)} m
                    </span>
                    {metric.totalClimb !== undefined && (
                      <>
                        {' '}
                        ·{' '}
                        <span title="累计爬升">
                          {Math.round(metric.totalClimb)} m ↗
                        </span>
                      </>
                    )}{' '}
                    ·{' '}
                    <span title="按当前速度计算的预计时间">
                      {formatRouteTime(metric.estimatedTime)}
                    </span>
                  </span>
                </span>
                <span className="route-card-metrics">
                  <span title="路线难度">
                    <DifficultyTag difficulty={metric.difficulty} size="sm" />
                  </span>
                  <span className="metric-separator">•</span>
                  <span
                    title="分支点：存在多个可行离开方向的节点"
                    role="img"
                    aria-label={`分支点：${metric.branchingPoints ?? '—'}`}
                  >
                    <Split size={12} />
                    {metric.branchingPoints ?? '—'}
                  </span>
                  <span className="metric-separator">•</span>
                  <span
                    title="决策点：排除短于 50 米死路后的有效路口"
                    role="img"
                    aria-label={`决策点：${metric.decisionPoints ?? '—'}`}
                  >
                    <Brain size={12} />
                    {metric.decisionPoints ?? '—'}
                  </span>
                  <span className="metric-separator">•</span>
                  <span
                    title="楼梯：路线经过的楼梯连接数量"
                    role="img"
                    aria-label={`楼梯：${metric.stairs ?? '—'}`}
                  >
                    <ArrowUpDown size={12} />
                    {metric.stairs ?? '—'}
                  </span>
                  <span className="metric-separator">•</span>
                  <span
                    title="重复路段：与前面各赛段最短路线重复的长度占比"
                    role="img"
                    aria-label={`重复路段：${repeat}`}
                  >
                    <Repeat size={12} />
                    {repeat}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
