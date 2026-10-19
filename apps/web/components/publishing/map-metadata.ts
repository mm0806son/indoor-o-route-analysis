import { loadPdfJs } from "@/lib/load-pdfjs";
import type { EventData } from "@indoor-o-route-analysis/core";

/** Inspect only selected, embedded maps. PDF dimensions use the editor's millimetre convention. */
export async function inspectPublicationMaps(
  event: EventData,
  courseIds: string[],
) {
  for (const race of event.raceCourses ?? []) {
    const selected = (race.courses ?? []).filter((course) =>
      courseIds.includes(course.id),
    );
    for (const map of race.maps ?? []) {
      if (
        !selected.some(
          (course) => course.mapId === map.id || race.maps?.length === 1,
        )
      )
        continue;
      const encoded = map.image.encodedData;
      if (!encoded) continue;
      const base64 = encoded.startsWith("data:")
        ? encoded.slice(encoded.indexOf(",") + 1)
        : encoded;
      const mime = encoded.startsWith("data:")
        ? encoded.slice(5, encoded.indexOf(";"))
        : base64.startsWith("JVBER")
          ? "application/pdf"
          : base64.startsWith("iVBOR")
            ? "image/png"
            : base64.startsWith("/9j/")
              ? "image/jpeg"
              : base64.startsWith("UklGR")
                ? "image/webp"
                : map.image.mediaType;
      if (!mime)
        throw new Error(`地图 ${map.id} 无法识别格式，请重新附加 PDF / 图片。`);
      map.image.mediaType = mime;
      if (mime !== "application/pdf") continue;
      const pdfjs = await loadPdfJs();
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      try {
        const page = await pdf.getPage(1);
        const size = page.getViewport({ scale: 1 });
        map.pageCount = pdf.numPages;
        map.image.width = (size.width * 25.4) / 72;
        map.image.height = (size.height * 25.4) / 72;
        for (let i = 2; i <= pdf.numPages; i++) {
          const other = (await pdf.getPage(i)).getViewport({ scale: 1 });
          if (
            Math.abs(other.width - size.width) > 1 ||
            Math.abs(other.height - size.height) > 1
          )
            throw new Error("地图 PDF 各页尺寸不同，请先统一页面尺寸再发布。");
        }
      } finally {
        await pdf.destroy();
      }
    }
  }
}
