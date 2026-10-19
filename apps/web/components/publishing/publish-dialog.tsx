"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, Plus, X } from "lucide-react";
import { useAppData } from "@indoor-o-route-analysis/ui";
import {
  arrayBufferToBase64,
  createPublishedEvent,
  getMapFile,
  processImportedJSON,
  type EventData,
  type PublishedEvent,
} from "@indoor-o-route-analysis/core";
import { createBundle, parseBundle } from "./publication-bundle";
import { prepareEventMaps } from "./prepare-event";
import { inspectPublicationMaps } from "./map-metadata";
import { savePublicationPreview } from "@/lib/publication-preview";

export default function PublishDialog({ onClose }: { onClose: () => void }) {
  const { selectedEvent: editorEvent, currentPdfData: editorPdfData } =
    useAppData();
  const [imported, setImported] = useState<{
    event: EventData;
    pdfData: ArrayBuffer | null;
  } | null>(null);
  const selectedEvent = imported?.event ?? editorEvent;
  const currentPdfData = imported ? imported.pdfData : editorPdfData;
  const [packages, setPackages] = useState<PublishedEvent[]>([]);
  const [publicIds, setPublicIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [eventId, setEventId] = useState(selectedEvent?.id ?? "");
  const [revision, setRevision] = useState("1");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const courses =
    selectedEvent?.raceCourses?.flatMap((race) => race.courses ?? []) ?? [];
  const routes =
    selectedEvent?.raceCourses?.flatMap((race) => race.customRoutes ?? []) ??
    [];
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function addCurrent(preview = false) {
    if (!selectedEvent) return;
    setBusy(true);
    setError("");
    try {
      const source = await prepareEventMaps(
        selectedEvent,
        courseIds,
        currentPdfData,
        getMapFile,
      );
      await inspectPublicationMaps(source, courseIds);
      const published = createPublishedEvent(source, {
        eventId,
        revision,
        courseIds,
        recommendedRouteIds: routeIds,
      });
      if (preview) {
        const token = savePublicationPreview(published, window.sessionStorage);
        window.location.assign(`/viewer?preview=${encodeURIComponent(token)}`);
        return;
      }
      const previous = packages.find((item) => item.eventId === eventId);
      if (previous?.revision === revision)
        throw new Error("更新同一比赛时请使用新的版本标识。");
      createBundle([published], eventId);
      setPackages((items) => [
        ...items.filter((item) => item.eventId !== eventId),
        published,
      ]);
      setPublicIds((ids) => (ids.includes(eventId) ? ids : [...ids, eventId]));
      setCurrent(eventId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    try {
      const bundle = createBundle(
        packages.filter((item) => publicIds.includes(item.eventId)),
        current,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "publication-bundle.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      style={{
        width: "100vw",
        height: "100dvh",
        bottom: "auto",
        overflowX: "hidden",
      }}
    >
      <section
        style={{
          width: "calc(100vw - 24px)",
          maxWidth: "36rem",
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        className="max-h-[90dvh] min-w-0 w-full max-w-xl overflow-auto rounded border border-border bg-background p-4 text-sm shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="publish-title" className="font-semibold">
            赛后发布设置
          </h2>
          <button
            onClick={onClose}
            title="关闭 (Esc)"
            aria-label="关闭发布设置"
            className="p-2"
          >
            <X size={18} />
          </button>
        </div>
        <p className="my-2 text-muted-foreground">
          在本机准备公开内容，下载后打包并上传同一静态站点，固定链接才会更新。Alt+Shift+P
          打开发布设置，Esc 关闭。关闭窗口前请下载发布包作为备份。
        </p>
        <label className="block my-3">
          导入线路设计 JSON（现有软件保存的比赛文件）
          <input
            type="file"
            accept="application/json,.json"
            className="mt-1 block w-full"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const result = await processImportedJSON(
                  JSON.parse(await file.text()),
                );
                setImported({
                  event: result.event,
                  pdfData: result.pdfData ?? null,
                });
                setEventId(result.event.id);
                setCourseIds([]);
                setRouteIds([]);
                setError("");
              } catch (reason) {
                setError(
                  reason instanceof Error ? reason.message : String(reason),
                );
              }
              event.target.value = "";
            }}
          />
        </label>
        <label className="block my-3">
          导入上次发布包（恢复公开比赛）
          <input
            type="file"
            accept="application/json,.json"
            className="mt-1 block w-full"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const bundle = parseBundle(JSON.parse(await file.text()));
                setPackages(bundle.events);
                setPublicIds(bundle.events.map((item) => item.eventId));
                setCurrent(bundle.currentEventId);
                setError("");
              } catch (reason) {
                setError(
                  reason instanceof Error ? reason.message : String(reason),
                );
              }
              event.target.value = "";
            }}
          />
        </label>
        {selectedEvent && (
          <fieldset className="min-w-0 space-y-2 rounded border border-border p-3">
            <legend>加入当前编辑比赛：{selectedEvent.name}</legend>
            <label className="block">
              稳定比赛标识
              <input
                aria-label="稳定比赛标识"
                className="block w-full min-w-0 rounded bg-muted p-1"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              />
            </label>
            <label className="block">
              发布版本
              <input
                aria-label="发布版本"
                className="block w-full min-w-0 rounded bg-muted p-1"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
              />
            </label>
            <p className="text-muted-foreground">
              标识仅用英文字母、数字、下划线或连字符；更新比赛请更换版本。
            </p>
            <p>选择公开赛程：</p>
            {courses.map((course) => (
              <label key={course.id} className="block">
                <input
                  type="checkbox"
                  checked={courseIds.includes(course.id)}
                  onChange={() => {
                    const next = toggle(courseIds, course.id);
                    setCourseIds(next);
                    setRouteIds((ids) =>
                      ids.filter((id) =>
                        routes.some(
                          (route) =>
                            route.id === id && next.includes(route.courseId),
                        ),
                      ),
                    );
                  }}
                />{" "}
                {course.name}
              </label>
            ))}
            {(selectedEvent.raceCourses ?? []).flatMap((race, raceIndex) =>
              (race.maps ?? [])
                .filter((map) =>
                  (race.courses ?? []).some(
                    (course) =>
                      courseIds.includes(course.id) &&
                      (course.mapId === map.id || race.maps?.length === 1),
                  ),
                )
                .map((map) => (
                  <label key={`${raceIndex}-${map.id}`} className="block">
                    地图 {map.id}：
                    {map.image.encodedData
                      ? "已嵌入，可替换"
                      : "可补充本地 PDF / 图片"}
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      className="block w-full"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          const source = structuredClone(selectedEvent);
                          const target = source.raceCourses![
                            raceIndex
                          ].maps!.find((item) => item.id === map.id)!;
                          target.image.encodedData = arrayBufferToBase64(
                            await file.arrayBuffer(),
                          );
                          target.image.mediaType = file.type;
                          delete target.image.url;
                          setImported({
                            event: source,
                            pdfData: currentPdfData,
                          });
                          setError("");
                        } catch (reason) {
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : String(reason),
                          );
                        }
                        event.target.value = "";
                      }}
                    />
                  </label>
                )),
            )}
            <p>明确选择组织者推荐路线（默认全部不公开）：</p>
            {routes
              .filter((route) => courseIds.includes(route.courseId))
              .map((route) => (
                <label key={route.id} className="block">
                  <input
                    type="checkbox"
                    checked={routeIds.includes(route.id)}
                    onChange={() => setRouteIds(toggle(routeIds, route.id))}
                  />{" "}
                  {route.name}
                </label>
              ))}
            <button
              disabled={busy || !courseIds.length}
              onClick={() => addCurrent()}
              className="flex items-center gap-2 rounded bg-purple-700 px-3 py-2 disabled:opacity-50"
            >
              <Plus size={16} />
              {busy ? "校验并嵌入地图…" : "加入 / 更新公开包"}
            </button>
          </fieldset>
        )}
        <fieldset className="my-3 space-y-2">
          <legend className="font-medium">公开比赛与固定入口</legend>
          <label className="block">
            <input
              type="radio"
              name="current-event"
              checked={current === null}
              onChange={() => setCurrent(null)}
            />{" "}
            暂停固定入口（已公开历史链接仍可访问）
          </label>
          {packages.map((item) => (
            <div
              key={item.eventId}
              className="flex flex-wrap items-center gap-3 rounded bg-muted p-2"
            >
              <label>
                <input
                  type="checkbox"
                  checked={publicIds.includes(item.eventId)}
                  onChange={() => {
                    setPublicIds(toggle(publicIds, item.eventId));
                    if (current === item.eventId) setCurrent(null);
                  }}
                />{" "}
                公开 {item.event.name} ({item.revision})
              </label>
              <label>
                <input
                  type="radio"
                  name="current-event"
                  disabled={!publicIds.includes(item.eventId)}
                  checked={current === item.eventId}
                  onChange={() => setCurrent(item.eventId)}
                />{" "}
                当前比赛
              </label>
            </div>
          ))}
          <p className="text-muted-foreground">
            取消公开即归档：该比赛不进入新发布包。请保留此前发布包作本地备份。要暂停全部访问，请取消所有比赛的公开状态。
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="my-2 text-red-400">
            {error}
          </p>
        )}
        <button
          onClick={() => addCurrent(true)}
          disabled={busy || !selectedEvent || !courseIds.length}
          title="使用当前选择在本标签页预览，不上传文件或修改公开站点"
          className="mb-2 flex items-center gap-2 rounded bg-purple-700 px-3 py-2 disabled:opacity-50"
        >
          <Eye size={16} />预览运动员页面
        </button>
        <p className="mb-2 text-muted-foreground">预览使用上方选中的赛程和推荐路线；数据只放在当前标签页会话中，不会上传。进入预览前可先下载发布包备份设置。</p>
        <button
          onClick={download}
          className="flex items-center gap-2 rounded bg-purple-700 px-3 py-2"
        >
          <Download size={16} />
          下载发布包
        </button>
        <p className="mt-2 text-muted-foreground">
          地图和推荐路线公开可下载；运动员个人路线留在其浏览器。发布包不包含未选择的个人路线。
        </p>
      </section>
    </div>,
    document.body,
  );
}
