'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
} from 'lucide-react';
import {
  createPublishedRouteAnalyzer,
  exportPublishedRouteGpx,
  validatePublishedRoute,
  type PublishedEvent,
  type CustomRoute,
  type Course,
  type RouteLeg,
} from '@indoor-o-route-analysis/core';
import { loadViewerPublication } from '@/lib/published-loader';
import {
  backupDrafts,
  parseBackup,
  readDrafts,
  retainedDraftKeys,
  writeDrafts,
  type DraftScope,
} from '@/lib/published-storage';
import { makeDraft } from '@/lib/published-route';
import { PublishedMap } from './map';
import './viewer.css';
function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data),
    a = document.createElement('a');
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
    [error, setError] = useState(''),
    [localPreview, setLocalPreview] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setLocalPreview(new URLSearchParams(location.search).has('preview'));
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
        <h1>{localPreview ? '本地预览' : '赛后复盘'}</h1>
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
          赛程{' '}
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
    [selected, setSelected] = useState(''),
    [ready, setReady] = useState(false),
    [storageBlocked, setStorageBlocked] = useState(false);
  const [history, setHistory] = useState<CustomRoute[][]>([]),
    [future, setFuture] = useState<CustomRoute[][]>([]),
    [legIndex, setLegIndex] = useState(0),
    [via, setVia] = useState<string[]>([]),
    [preview, setPreview] = useState<RouteLeg>(),
    [candidates, setCandidates] = useState<RouteLeg[]>([]),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''),
    [help, setHelp] = useState(false),
    [graph, setGraph] = useState(true),
    [fit, setFit] = useState(0),
    [collapsed, setCollapsed] = useState(false),
    [overlay, setOverlay] = useState(true);
  const [start, setStart] = useState(`${published.event.startTime.date}T10:00`),
    [duration, setDuration] = useState('600');
  const worker = useRef<Worker | null>(null),
    mapImage = useRef<HTMLCanvasElement | null>(null),
    input = useRef<HTMLInputElement>(null);
  const acceptMap = useCallback((canvas: HTMLCanvasElement) => {
    mapImage.current = canvas;
  }, []);
  const route = routes.find((r) => r.id === selected) ?? routes[0];
  const from = course.controls[legIndex]?.controlId,
    to = course.controls[legIndex + 1]?.controlId;
  const recommendation = published.recommendations.find(
      (r) => r.courseId === course.id,
    ),
    recommended = recommendation?.legs[legIndex];
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
      setSelected(stored[0]?.id ?? '');
      if (retainedDraftKeys(localStorage, scope).length)
        setMessage(
          '检测到旧版本个人路线，已保留在本机但未套用到新地图。请在原版本中打开或备份。',
        );
      const timing = localStorage.getItem(
        `published-timing:${JSON.stringify(scope)}`,
      );
      if (timing) {
        const saved = JSON.parse(timing);
        if (
          typeof saved.start === 'string' &&
          typeof saved.duration === 'string'
        ) {
          setStart(saved.start);
          setDuration(saved.duration);
        }
      }
    } catch {
      setStorageBlocked(true);
      setMessage('本地草稿读取失败。原数据未覆盖；可以继续编辑并下载备份。');
    }
    setReady(true);
  }, [scope]);
  const persist = useCallback(
    (next: CustomRoute[]) => {
      if (storageBlocked) return;
      try {
        writeDrafts(localStorage, scope, next);
      } catch {
        setMessage('浏览器保存失败，请下载路线备份。');
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
    if (!from || !to) return;
    setBusy(true);
    const w = new Worker(new URL('./route.worker.ts', import.meta.url));
    worker.current = w;
    w.onmessage = (e) => {
      setBusy(false);
      if (e.data.error) setMessage(e.data.error);
      else {
        setPreview(e.data.leg);
        setCandidates(e.data.candidates ?? []);
      }
      w.terminate();
    };
    w.onerror = () => {
      setBusy(false);
      setMessage('路线计算失败，请重试。');
      w.terminate();
    };
    // Route search needs graph and scale only; do not clone the embedded map into each worker.
    const searchData = {
      ...published,
      recommendations: [],
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
      setMessage('时间设置保存失败，请记录当前输入。');
    }
  };
  const backup = useCallback(
    () =>
      download(
        '我的路线备份.json',
        new Blob([backupDrafts(scope, routes)], { type: 'application/json' }),
      ),
    [scope, routes],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea')) return;
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        create();
      } else if (e.key.toLowerCase() === 'f') {
        setFit((x) => x + 1);
      } else if (e.key === '?') {
        setHelp((h) => !h);
      } else if (e.key.toLowerCase() === 'b') {
        backup();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
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
    setMessage('本赛段已加入我的路线');
  };
  const gpx = () => {
    try {
      if (!route) throw Error('请先创建并完成个人路线');
      validatePublishedRoute(published, route);
      const xml = exportPublishedRouteGpx(published, route, {
        startTime: new Date(start).toISOString(),
        totalDurationSeconds: Number(duration),
      });
      download(
        `${route.name}.gpx`,
        new Blob([xml], { type: 'application/gpx+xml' }),
      );
      setMessage('已导出：手工重建、合成坐标、估算时间。');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  const highlights = [
    ...(overlay && recommended
      ? [
          {
            path: recommended.path.map((n) => n.nodeId),
            color: '#f59e0b',
            progress: 1,
          },
        ]
      : []),
    ...(preview
      ? [
          {
            path: preview.path.map((n) => n.nodeId),
            color: '#38bdf8',
            progress: 1,
          },
        ]
      : []),
    ...(route?.legs[legIndex]?.path.length
      ? [
          {
            path: route.legs[legIndex].path.map((n) => n.nodeId),
            color: '#c084fc',
            progress: 1,
          },
        ]
      : []),
  ];
  const previewDistance = preview
      ? analyzer.calculatePathDistance(preview.path.map((n) => n.nodeId))
      : null,
    recommendedDistance = recommended
      ? analyzer.calculatePathDistance(recommended.path.map((n) => n.nodeId))
      : null;
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
        <section className={`viewer-panel ${collapsed ? 'collapsed' : ''}`}>
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
            <p>
              <span className="legend recommended">●</span> 组织者推荐{' '}
              {recommendedDistance !== null
                ? `${recommendedDistance.toFixed(1)} m`
                : '未提供'}{' '}
              <label>
                <input
                  type="checkbox"
                  checked={overlay}
                  onChange={(e) => setOverlay(e.target.checked)}
                />
                叠加
              </label>
            </p>
            <p>
              <span className="legend candidate">●</span>{' '}
              {via.length
                ? '途经点方案'
                : candidates.indexOf(preview!) > 0
                  ? '候选方案'
                  : '最短距离'}{' '}
              {previewDistance !== null
                ? `${previewDistance.toFixed(1)} m`
                : ''}
              {previewDistance !== null && recommendedDistance !== null
                ? `（较推荐 ${(previewDistance - recommendedDistance).toFixed(1)} m）`
                : ''}
            </p>
            <p className="hint">
              点击地图节点探索其他跑法；每段按合法图边连接。
            </p>
            {candidates.length > 1 && (
              <label>
                候选路线（最多 4 条）
                <select
                  aria-label="候选路线"
                  value={Math.max(
                    0,
                    candidates.findIndex(
                      (c) =>
                        JSON.stringify(c.path) ===
                        JSON.stringify(preview?.path),
                    ),
                  )}
                  onChange={(e) =>
                    setPreview(candidates[Number(e.target.value)])
                  }
                >
                  {candidates.map((c, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '最短距离' : `方案 ${i + 1}`} ·{' '}
                      {analyzer
                        .calculatePathDistance(c.path.map((n) => n.nodeId))
                        .toFixed(1)}{' '}
                      m
                    </option>
                  ))}
                </select>
              </label>
            )}
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
                    setMessage('已取消路线计算');
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
                value={route?.id ?? ''}
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
                <p>
                  <span className="legend personal">●</span> 已完成{' '}
                  {route.legs.filter((l) => l.path.length > 0).length}/
                  {route.legs.length} 段 ·{' '}
                  {route.legs
                    .reduce(
                      (sum, l) =>
                        sum +
                        analyzer.calculatePathDistance(
                          l.path.map((n) => n.nodeId),
                        ),
                      0,
                    )
                    .toFixed(1)}{' '}
                  m
                </p>
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
                e.target.value = '';
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
                  setSelected(merged.at(-1)?.id ?? '');
                  setMessage('备份已恢复；现有路线已保留');
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
                    setMessage('地图尚未加载');
                    return;
                  }
                  mapImage.current.toBlob((blob) => {
                    if (blob) download('比赛地图.png', blob);
                  }, 'image/png');
                }}
              >
                下载地图
              </button>
            </div>
            <p className="hint">
              路线仅存本机浏览器。清理浏览器会删除草稿，请定期备份。GPX
              为合成坐标和估算时间。
            </p>
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
            onClick={() => setMessage('')}
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
              橙色为组织者推荐，蓝色为当前探索方案，紫色为个人路线。最短距离不代表实际最快。
            </p>
            <p>
              选赛段 → 点击地图途经节点 →
              采用此赛段。点击途经点标签删除或重新选择。每条路线必须完成所有赛段后才能导出
              GPX。拖动平移，双指捏合、滚轮或 +/− 按钮缩放。
            </p>
            <p>
              快捷键：N 新建；Ctrl/Cmd+Z 撤销；Ctrl/Cmd+Shift+Z 重做；F
              适配地图；B 下载备份；? 打开说明。
            </p>
            <p>
              个人数据只保存在当前浏览器，并按比赛、版本、赛程隔离。版本变化请保留旧备份，不自动套用。写入失败时请下载备份。
            </p>
            <p>
              GPX 使用地图版面的合成坐标，不是实测
              GPS；时间由起跑时间和总用时估算。QuickRoute 中导入 GPX
              和下载地图后手动对齐；Headcam O 按版本使用直接导入或 QuickRoute
              中间文件。目标软件实际兼容性仍需样例验收。
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
