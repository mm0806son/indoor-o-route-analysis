"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Copy,
  Download,
  FileUp,
  HelpCircle,
  Network,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Maximize,
  PanelBottomClose,
} from "lucide-react";
import {
  createPublishedRouteAnalyzer,
  exportPublishedRouteGpx,
  validatePublishedRoute,
  ROUTE_ANALYSIS_COLORS,
  type PublishedEvent,
  type CustomRoute,
  type Course,
  type RouteLeg,
} from "@indoor-o-route-analysis/core";
import { loadViewerPublication } from "@/lib/published-loader";
import {
  backupDrafts,
  parseBackup,
  readDrafts,
  retainedDraftKeys,
  writeDrafts,
  type DraftScope,
} from "@/lib/published-storage";
import {
  makeDraft,
  measurePublishedLeg,
  type PublishedRouteMetrics,
} from "@/lib/published-route";
import { CandidateTable, formatRouteTime } from "./candidate-table";
import { DifficultyTag } from "@/components/route-analysis/difficulty-tag";
import { PublishedMap } from "./map";
import "./viewer.css";
function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Icon({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export default function PublishedViewer() {
  const [loaded, setLoaded] =
      useState<Awaited<ReturnType<typeof loadViewerPublication>>>(),
    [error, setError] = useState(""),
    [localPreview, setLocalPreview] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setLocalPreview(new URLSearchParams(location.search).has("preview"));
    loadViewerPublication(location.href, undefined, controller.signal)
      .then(setLoaded)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  if (error)
    return (
      <main className="published-viewer published-loading">
        <h1>{localPreview ? "本地预览" : "赛后复盘"}</h1>
        <p role="alert">{error}</p>
        {localPreview && (
          <p>预览只保存在当前标签页中。请返回编辑器重新生成本地预览。</p>
        )}
        {localPreview && <a href="/">返回编辑器</a>}
        <button type="button" onClick={() => setRetry((x) => x + 1)}>
          重新加载
        </button>
      </main>
    );
  if (!loaded)
    return (
      <main className="published-viewer published-loading">正在加载比赛…</main>
    );
  return (
    <EventViewer
      key={`${loaded.published.eventId}:${loaded.published.revision}`}
      {...loaded}
    />
  );
}
function EventViewer({
  published,
  dataUrl,
  localPreview,
}: {
  published: PublishedEvent;
  dataUrl: string;
  localPreview: boolean;
}) {
  const courses = published.event.raceCourses!.flatMap(
    (race) => race.courses ?? [],
  );
  const [courseId, setCourseId] = useState(courses[0]?.id);
  const course = courses.find((c) => c.id === courseId);
  return (
    <main className="published-viewer">
      {localPreview && (
        <div className="local-preview-banner" role="status">
          <span>本地预览 · 尚未在线发布</span>
          <a href="/">返回编辑器</a>
        </div>
      )}
      <header>
        <div>
          <strong>{published.event.name}</strong>
          <small>赛后复盘 · {published.event.startTime.date}</small>
        </div>
        <label>
          赛程{" "}
          <select
            aria-label="赛程"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {course ? (
        <CourseViewer
          key={course.id}
          published={published}
          course={course}
          dataUrl={dataUrl}
        />
      ) : (
        <p role="alert">没有公开赛程</p>
      )}
    </main>
  );
}
function CourseViewer({
  published,
  course,
  dataUrl,
}: {
  published: PublishedEvent;
  course: Course;
  dataUrl: string;
}) {
  const scope = useMemo<DraftScope>(
    () => ({
      eventId: published.eventId,
      revision: published.revision,
      courseId: course.id,
    }),
    [published, course],
  );
  const race = published.event.raceCourses!.find((race) =>
      race.courses?.some((c) => c.id === course.id),
    )!,
    map = race.maps!.find((m) => m.id === course.mapId)!;
  const analyzer = useMemo(
    () => createPublishedRouteAnalyzer(published, course.id),
    [published, course],
  );
  const [routes, setRoutes] = useState<CustomRoute[]>([]),
    [selected, setSelected] = useState(""),
    [ready, setReady] = useState(false),
    [storageBlocked, setStorageBlocked] = useState(false);
  const [history, setHistory] = useState<CustomRoute[][]>([]),
    [future, setFuture] = useState<CustomRoute[][]>([]),
    [legIndex, setLegIndex] = useState(0),
    [via, setVia] = useState<string[]>([]),
    [preview, setPreview] = useState<RouteLeg>(),
    [candidates, setCandidates] = useState<RouteLeg[]>([]),
    [candidateMetrics, setCandidateMetrics] = useState<PublishedRouteMetrics[]>(
      [],
    ),
    [runningSpeed, setRunningSpeed] = useState(5),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [help, setHelp] = useState(false),
    [graph, setGraph] = useState(true),
    [fit, setFit] = useState(0),
    [collapsed, setCollapsed] = useState(false),
    [compare, setCompare] = useState(true);
  const [start, setStart] = useState(`${published.event.startTime.date}T10:00`),
    [duration, setDuration] = useState("600");
  const worker = useRef<Worker | null>(null),
    mapImage = useRef<HTMLCanvasElement | null>(null),
    input = useRef<HTMLInputElement>(null);
  const acceptMap = useCallback((canvas: HTMLCanvasElement) => {
    mapImage.current = canvas;
  }, []);
  const route = routes.find((r) => r.id === selected) ?? routes[0];
  const from = course.controls[legIndex]?.controlId,
    to = course.controls[legIndex + 1]?.controlId;
  const nodeIds = useMemo(
    () =>
      new Set([
        ...(race.vertices ?? []).map((n) => n.id),
        ...(race.controls ?? []).map((c) => c.id),
      ]),
    [race],
  );
  useEffect(() => {
    try {
      const stored = readDrafts(localStorage, scope);
      setRoutes(stored);
      setSelected(stored[0]?.id ?? "");
      if (retainedDraftKeys(localStorage, scope).length)
        setMessage(
          "检测到旧版本个人路线，已保留在本机但未套用到新地图。请在原版本中打开或备份。",
        );
      const timing = localStorage.getItem(
        `published-timing:${JSON.stringify(scope)}`,
      );
      if (timing) {
        const saved = JSON.parse(timing);
        if (
          typeof saved.start === "string" &&
          typeof saved.duration === "string"
        ) {
          setStart(saved.start);
          setDuration(saved.duration);
        }
      }
    } catch {
      setStorageBlocked(true);
      setMessage("本地草稿读取失败。原数据未覆盖；可以继续编辑并下载备份。");
    }
    setReady(true);
  }, [scope]);
  const persist = useCallback(
    (next: CustomRoute[]) => {
      if (storageBlocked) return;
      try {
        writeDrafts(localStorage, scope, next);
      } catch {
        setMessage("浏览器保存失败，请下载路线备份。");
      }
    },
    [scope, storageBlocked],
  );
  const commit = useCallback(
    (next: CustomRoute[]) => {
      setHistory((h) => [...h.slice(-49), routes]);
      setFuture([]);
      setRoutes(next);
      persist(next);
    },
    [routes, persist],
  );
  const undo = useCallback(() => {
    if (!history.length) return;
    const next = history[history.length - 1];
    setFuture((f) => [routes, ...f]);
    setHistory((h) => h.slice(0, -1));
    setRoutes(next);
    persist(next);
  }, [history, routes, persist]);
  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setHistory((h) => [...h, routes]);
    setFuture((f) => f.slice(1));
    setRoutes(next);
    persist(next);
  }, [future, routes, persist]);
  const create = useCallback(() => {
    const next = makeDraft(course, crypto.randomUUID());
    commit([...routes, next]);
    setSelected(next.id);
  }, [course, commit, routes]);
  useEffect(() => {
    setVia([]);
    setPreview(undefined);
  }, [legIndex]);
  useEffect(() => {
    worker.current?.terminate();
    setPreview(undefined);
    setCandidates([]);
    setCandidateMetrics([]);
    if (!from || !to) return;
    setBusy(true);
    const w = new Worker(new URL("./route.worker.ts", import.meta.url));
    worker.current = w;
    w.onmessage = (e) => {
      setBusy(false);
      if (e.data.error) setMessage(e.data.error);
      else {
        setPreview(e.data.leg);
        setCandidates(e.data.candidates ?? []);
        setCandidateMetrics(e.data.candidateMetrics ?? []);
      }
      w.terminate();
    };
    w.onerror = () => {
      setBusy(false);
      setMessage("路线计算失败，请重试。");
      w.terminate();
    };
    // Route search needs graph and scale only; do not clone the embedded map into each worker.
    const searchData = {
      ...published,
      event: {
        ...published.event,
        raceCourses: [
          {
            ...race,
            courses: [course],
            maps: [
              {
                ...map,
                image: { width: map.image.width, height: map.image.height },
              },
            ],
          },
        ],
      },
    };
    w.postMessage({
      published: searchData,
      courseId: course.id,
      from,
      to,
      via,
      runningSpeed: 5,
    });
    return () => w.terminate();
  }, [published, course, race, map, from, to, via]);
  const saveTiming = (nextStart: string, nextDuration: string) => {
    setStart(nextStart);
    setDuration(nextDuration);
    try {
      localStorage.setItem(
        `published-timing:${JSON.stringify(scope)}`,
        JSON.stringify({ start: nextStart, duration: nextDuration }),
      );
    } catch {
      setMessage("时间设置保存失败，请记录当前输入。");
    }
  };
  const backup = useCallback(
    () =>
      download(
        "我的路线备份.json",
        new Blob([backupDrafts(scope, routes)], { type: "application/json" }),
      ),
    [scope, routes],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,select,textarea")) return;
      if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        create();
      } else if (e.key.toLowerCase() === "f") {
        setFit((x) => x + 1);
      } else if (e.key === "?") {
        setHelp((h) => !h);
      } else if (e.key.toLowerCase() === "b") {
        backup();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo, redo, create, backup]);
  const apply = () => {
    if (!preview) return;
    const draft = route ?? makeDraft(course, crypto.randomUUID());
    const next = {
      ...draft,
      legs: draft.legs.map((leg, i) => (i === legIndex ? preview : leg)),
    };
    commit(
      route
        ? routes.map((r) => (r.id === route.id ? next : r))
        : [...routes, next],
    );
    setSelected(next.id);
    setMessage("本赛段已加入我的路线");
  };
  const gpx = () => {
    try {
      if (!route) throw Error("请先创建并完成个人路线");
      validatePublishedRoute(published, route);
      const xml = exportPublishedRouteGpx(published, route, {
        startTime: new Date(start).toISOString(),
        totalDurationSeconds: Number(duration),
      });
      download(
        `${route.name}.gpx`,
        new Blob([xml], { type: "application/gpx+xml" }),
      );
      setMessage("已导出 GPX");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  const selectedCandidate = candidates.findIndex(
    (candidate) =>
      candidate.path.map((node) => node.nodeId).join("|") ===
      preview?.path.map((node) => node.nodeId).join("|"),
  );
  const displayedCandidateMetrics = useMemo(
    () =>
      candidateMetrics.map((metric) => ({
        ...metric,
        estimatedTime: metric.distance / runningSpeed,
        timeDelta: metric.distanceDelta / runningSpeed,
      })),
    [candidateMetrics, runningSpeed],
  );
  const viaMetrics = useMemo(
    () =>
      preview && selectedCandidate < 0
        ? measurePublishedLeg(
            analyzer,
            preview,
            candidateMetrics[0]?.distance ?? 0,
            runningSpeed,
          )
        : undefined,
    [analyzer, preview, selectedCandidate, candidateMetrics, runningSpeed],
  );
  const highlights = [
    ...(compare
      ? candidates.flatMap((candidate, index) =>
          index === selectedCandidate
            ? []
            : [
                {
                  path: candidate.path.map((node) => node.nodeId),
                  color:
                    ROUTE_ANALYSIS_COLORS[index % ROUTE_ANALYSIS_COLORS.length],
                  progress: 1,
                  alpha: 0.4,
                },
              ],
        )
      : []),
    ...(route?.legs[legIndex]?.path.length
      ? [
          {
            path: route.legs[legIndex].path.map((node) => node.nodeId),
            color: "#a78bfa",
            progress: 1,
          },
        ]
      : []),
    ...(preview
      ? [
          {
            path: preview.path.map((node) => node.nodeId),
            color:
              selectedCandidate >= 0
                ? ROUTE_ANALYSIS_COLORS[
                    selectedCandidate % ROUTE_ANALYSIS_COLORS.length
                  ]
                : "#c084fc",
            progress: 1,
          },
        ]
      : []),
  ];
  const legMetrics = useMemo(
    () =>
      route?.legs.map((leg) => {
        if (!leg.path.length) return undefined;
        const best = analyzer.dijkstra(leg.fromControlId, leg.toControlId);
        return measurePublishedLeg(
          analyzer,
          leg,
          best?.distance ?? 0,
          runningSpeed,
        );
      }) ?? [],
    [route, analyzer, runningSpeed],
  );
  const totalDistance = legMetrics.reduce(
    (sum, metric) => sum + (metric?.distance ?? 0),
    0,
  );
  const totalTime = legMetrics.reduce(
    (sum, metric) => sum + (metric?.estimatedTime ?? 0),
    0,
  );
  const completedMetrics = legMetrics.filter(
    (metric): metric is PublishedRouteMetrics => !!metric,
  );
  const averageDifficulty = completedMetrics.length
    ? completedMetrics.reduce((sum, metric) => sum + metric.difficulty, 0) /
      completedMetrics.length
    : 0;
  return (
    <>
      <div className="viewer-workspace">
        <PublishedMap
          map={map}
          race={race}
          dataUrl={dataUrl}
          routes={highlights}
          leg={from && to ? { fromNodeId: from, toNodeId: to } : undefined}
          showGraph={graph}
          onNode={(id) => {
            setVia((v) => [...v, id]);
            setMessage(`途经节点：${id}`);
          }}
          fitToken={fit}
          onImage={acceptMap}
        />
        <section className={`viewer-panel ${collapsed ? "collapsed" : ""}`}>
          <div className="viewer-toolbar">
            <Icon label="新建路线 (N)" onClick={create} disabled={!ready}>
              <Plus size={18} />
            </Icon>
            <Icon
              label="撤销 (Ctrl+Z)"
              onClick={undo}
              disabled={!history.length}
            >
              <Undo2 size={18} />
            </Icon>
            <Icon
              label="重做 (Ctrl+Shift+Z)"
              onClick={redo}
              disabled={!future.length}
            >
              <Redo2 size={18} />
            </Icon>
            <Icon label="适配整图 (F)" onClick={() => setFit((x) => x + 1)}>
              <Maximize size={18} />
            </Icon>
            <Icon label="显示或隐藏图节点" onClick={() => setGraph((v) => !v)}>
              <Network size={18} />
            </Icon>
            <Icon label="使用说明 (?)" onClick={() => setHelp(true)}>
              <HelpCircle size={18} />
            </Icon>
            <Icon
              label="收起或展开面板"
              onClick={() => setCollapsed((v) => !v)}
            >
              <PanelBottomClose size={18} />
            </Icon>
          </div>
          <div className="panel-content">
            <label>
              赛段
              <select
                aria-label="赛段"
                value={legIndex}
                onChange={(e) => setLegIndex(Number(e.target.value))}
              >
                {course.controls.slice(1).map((c, i) => (
                  <option key={i} value={i}>
                    {i + 1}: {course.controls[i].controlId} → {c.controlId}
                  </option>
                ))}
              </select>
            </label>
            <div className="section-heading">
              <h2>路线选择</h2>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />
                地图对比
              </label>
            </div>
            <div className="analysis-settings">
              <label>
                速度{" "}
                <input
                  aria-label="预计速度"
                  type="number"
                  min="0.1"
                  max="20"
                  step="0.1"
                  value={runningSpeed}
                  onChange={(event) => {
                    const speed = Number(event.target.value);
                    if (speed > 0 && speed <= 20) setRunningSpeed(speed);
                  }}
                />{" "}
                m/s
              </label>
              <span>{busy ? "计算中…" : `${candidates.length} 条方案`}</span>
            </div>
            {candidateMetrics.length > 0 && (
              <CandidateTable
                metrics={displayedCandidateMetrics}
                selected={selectedCandidate}
                onSelect={(index) => setPreview(candidates[index])}
              />
            )}
            {!busy && viaMetrics && (
              <div
                role="group"
                aria-label="途经点路线指标"
                className="route-summary"
              >
                <span>途经点路线</span>
                <span>
                  <b>{Math.round(viaMetrics.distance)}</b> m
                </span>
                <span>
                  <b>{formatRouteTime(viaMetrics.estimatedTime)}</b> 预计
                </span>
                <DifficultyTag difficulty={viaMetrics.difficulty} size="sm" />
              </div>
            )}
            <p className="hint">点选方案对比，或在地图上选择途经节点。</p>
            <div className="waypoints">
              {via.map((id, i) => (
                <button
                  type="button"
                  key={i}
                  title={`移除途经点 ${id}`}
                  onClick={() => setVia((v) => v.filter((_, j) => j !== i))}
                >
                  {id} ×
                </button>
              ))}
            </div>
            <div className="row">
              <button
                type="button"
                onClick={() => setVia([])}
                disabled={!via.length}
              >
                重置途经点
              </button>
              {busy ? (
                <button
                  type="button"
                  onClick={() => {
                    worker.current?.terminate();
                    setBusy(false);
                    setMessage("已取消路线计算");
                  }}
                >
                  取消计算
                </button>
              ) : (
                <button type="button" onClick={apply} disabled={!preview}>
                  采用此赛段
                </button>
              )}
            </div>
            <hr />
            <label>
              我的路线
              <select
                aria-label="我的路线"
                value={route?.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="" disabled>
                  请新建路线
                </option>
                {routes.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {route && (
              <>
                <label>
                  路线名称
                  <input
                    aria-label="路线名称"
                    value={route.name}
                    onChange={(e) =>
                      commit(
                        routes.map((r) =>
                          r.id === route.id
                            ? { ...r, name: e.target.value }
                            : r,
                        ),
                      )
                    }
                  />
                </label>
                <div className="route-summary">
                  <span>
                    <b>{Math.round(totalDistance)}</b> m
                  </span>
                  <span>
                    <b>{formatRouteTime(totalTime)}</b> 预计
                  </span>
                  <span title="已完成赛段的平均难度">
                    <DifficultyTag difficulty={averageDifficulty} size="sm" />{" "}
                    平均
                  </span>
                  <span>
                    已完成 {completedMetrics.length}/{route.legs.length} 段
                  </span>
                </div>
                <table
                  className="route-data-table personal-leg-table"
                  aria-label="我的路线赛段"
                >
                  <thead>
                    <tr>
                      <th>赛段</th>
                      <th>长度</th>
                      <th>较最短</th>
                      <th>时间</th>
                      <th>时间差</th>
                      <th>难度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {route.legs.map((leg, index) => (
                      <tr
                        key={index}
                        className={legIndex === index ? "selected" : ""}
                        onClick={() => setLegIndex(index)}
                      >
                        <td>
                          <button
                            type="button"
                            onClick={() => setLegIndex(index)}
                            aria-label={`查看赛段 ${index + 1}`}
                          >
                            {index + 1}{" "}
                            <small>
                              {leg.fromControlId} → {leg.toControlId}
                            </small>
                          </button>
                        </td>
                        <td>
                          {legMetrics[index]
                            ? `${Math.round(legMetrics[index]!.distance)} m`
                            : "待完成"}
                        </td>
                        <td>
                          {legMetrics[index]
                            ? `${Math.round(legMetrics[index]!.distanceDelta)} m`
                            : "—"}
                        </td>
                        <td>
                          {legMetrics[index]
                            ? formatRouteTime(legMetrics[index]!.estimatedTime)
                            : "—"}
                        </td>
                        <td>
                          {legMetrics[index]
                            ? legMetrics[index]!.timeDelta > 0
                              ? `+${formatRouteTime(legMetrics[index]!.timeDelta)}`
                              : "—"
                            : "—"}
                        </td>
                        <td>
                          {legMetrics[index] ? (
                            <DifficultyTag
                              difficulty={legMetrics[index]!.difficulty}
                              size="sm"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="viewer-toolbar">
                  <Icon
                    label="复制路线"
                    onClick={() => {
                      const copy = {
                        ...structuredClone(route),
                        id: crypto.randomUUID(),
                        name: `${route.name} 副本`,
                      };
                      commit([...routes, copy]);
                      setSelected(copy.id);
                    }}
                  >
                    <Copy size={18} />
                  </Icon>
                  <Icon
                    label="删除路线（可撤销）"
                    onClick={() =>
                      commit(routes.filter((r) => r.id !== route.id))
                    }
                  >
                    <Trash2 size={18} />
                  </Icon>
                  <Icon label="备份个人路线 (B)" onClick={backup}>
                    <Download size={18} />
                  </Icon>
                  <Icon
                    label="恢复个人路线备份"
                    onClick={() => input.current?.click()}
                  >
                    <FileUp size={18} />
                  </Icon>
                </div>
              </>
            )}
            {!route && (
              <button type="button" onClick={() => input.current?.click()}>
                恢复个人路线备份
              </button>
            )}
            <input
              ref={input}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const restored = parseBackup(
                    await file.text(),
                    scope,
                    nodeIds,
                  );
                  const ids = new Set(routes.map((r) => r.id));
                  const merged = [
                    ...routes,
                    ...restored.map((r) =>
                      ids.has(r.id) ? { ...r, id: crypto.randomUUID() } : r,
                    ),
                  ];
                  commit(merged);
                  setSelected(merged.at(-1)?.id ?? "");
                  setMessage("备份已恢复；现有路线已保留");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : String(err));
                }
              }}
            />
            <label>
              起跑时间（设备本地时区）
              <input
                aria-label="起跑时间"
                type="datetime-local"
                value={start}
                onChange={(e) => saveTiming(e.target.value, duration)}
              />
            </label>
            <label>
              总用时（秒）
              <input
                aria-label="总用时"
                type="number"
                min="1"
                value={duration}
                onChange={(e) => saveTiming(start, e.target.value)}
              />
            </label>
            <div className="row">
              <button type="button" onClick={gpx} disabled={!route}>
                导出 GPX
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!mapImage.current) {
                    setMessage("地图尚未加载");
                    return;
                  }
                  mapImage.current.toBlob((blob) => {
                    if (blob) download("比赛地图.png", blob);
                  }, "image/png");
                }}
              >
                下载地图
              </button>
            </div>
            <p className="hint">个人路线自动保存在当前浏览器。</p>
          </div>
        </section>
      </div>
      {message && (
        <div role="status" className="viewer-status">
          {message}
          <button
            type="button"
            aria-label="关闭提示"
            title="关闭提示"
            onClick={() => setMessage("")}
            style={{ marginLeft: 12 }}
          >
            ×
          </button>
        </div>
      )}
      {help && (
        <div className="viewer-modal">
          <section role="dialog" aria-modal="true" aria-label="复盘使用说明">
            <h2>赛后复盘使用说明</h2>
            <p>
              选择赛段后自动显示最多 6
              条路线。点击表格选择方案，开启“地图对比”同时查看其他方案。长度、预计时间和难度沿用路线分析规则；速度可在表格上方调整。
            </p>
            <p>
              在地图上点选途经节点，点击“采用此赛段”保存到我的路线。下方赛段表可切换和检查全程。拖动平移，双指或滚轮缩放。
            </p>
            <p>
              快捷键：N 新建；Ctrl/Cmd+Z 撤销；Ctrl/Cmd+Shift+Z 重做；F
              适配地图；B 下载备份；? 打开说明。
            </p>
            <p>
              完成所有赛段后，输入起跑时间和总用时导出 GPX。下载地图后可在
              QuickRoute 中对齐，并用于 Headcam O
              视频同步。备份文件用于恢复编辑。
            </p>
            <button type="button" onClick={() => setHelp(false)}>
              关闭说明
            </button>
          </section>
        </div>
      )}
    </>
  );
}
