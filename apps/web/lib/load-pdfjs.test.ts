import { describe, it, expect, vi } from "vitest";
import {
  createPdfJsLoader,
  PDF_MODULE_URL,
  PDF_WORKER_URL,
} from "./load-pdfjs";
describe("local PDF module loader", () => {
  it("loads only the local module and shares a matching local worker across calls", async () => {
    const module = {
      GlobalWorkerOptions: { workerSrc: "" },
    } as typeof import("pdfjs-dist");
    const importer = vi.fn(async () => module);
    const load = createPdfJsLoader(importer);
    expect(await load()).toBe(module);
    expect(await load()).toBe(module);
    expect(importer).toHaveBeenCalledExactlyOnceWith(PDF_MODULE_URL);
    expect(module.GlobalWorkerOptions.workerSrc).toBe(PDF_WORKER_URL);
    expect(PDF_MODULE_URL).toBe("/pdf.min.mjs");
    expect(PDF_WORKER_URL).toBe("/pdf.worker.min.mjs");
  });
  it("allows retry after an import failure", async () => {
    const module = {
      GlobalWorkerOptions: { workerSrc: "" },
    } as typeof import("pdfjs-dist");
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(module);
    const load = createPdfJsLoader(importer);
    await expect(load()).rejects.toThrow("offline");
    await expect(load()).resolves.toBe(module);
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
