type PdfJs = typeof import("pdfjs-dist");
export const PDF_MODULE_URL = "/pdf.min.mjs";
export const PDF_WORKER_URL = "/pdf.worker.min.mjs";

/** Native same-origin ESM avoids bundler rewriting PDF.js' module exports. */
export function createPdfJsLoader(
  importModule: (url: string) => Promise<PdfJs>,
) {
  let loading: Promise<PdfJs> | undefined;
  return () => {
    if (!loading) {
      loading = importModule(PDF_MODULE_URL)
        .then((module) => {
          module.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
          return module;
        })
        .catch((error) => {
          loading = undefined;
          throw error;
        });
    }
    return loading;
  };
}

export const loadPdfJs = createPdfJsLoader(
  (url) => import(/* webpackIgnore: true */ /* @vite-ignore */ url),
);
