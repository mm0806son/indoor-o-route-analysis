/**
 * Opens a file picker for JSON files, with a fallback for browsers that don't
 * support the File System Access API (e.g. Safari).
 *
 * When the File System Access API is available, resolves with a FileSystemFileHandle
 * so the caller can later write back to the same file (auto-save).
 *
 * When falling back to <input type="file">, resolves with a plain File object
 * wrapped in a minimal handle-like interface that only supports `getFile()`.
 * `createWritable` will be absent, so callers must degrade gracefully.
 */
export async function openJsonFilePicker(): Promise<FileSystemFileHandle | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const showOpenFilePicker = (window as any).showOpenFilePicker;
  if (typeof showOpenFilePicker === "function") {
    const [handle] = await showOpenFilePicker({
      types: [{ description: "JSON Files", accept: { "application/json": [".json"] } }],
      multiple: false,
    });
    return handle ?? null;
  }

  // Fallback: hidden <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      if (!file) {
        resolve(null);
        return;
      }
      // Wrap in a minimal FileSystemFileHandle-compatible object.
      // createWritable is intentionally omitted — callers should check before using it.
      const pseudoHandle = {
        kind: "file" as const,
        name: file.name,
        getFile: async () => file,
        isSameEntry: async () => false,
        queryPermission: async () => "granted" as PermissionState,
        requestPermission: async () => "granted" as PermissionState,
      } as unknown as FileSystemFileHandle;
      resolve(pseudoHandle);
    };

    input.oncancel = () => resolve(null);

    // Some browsers don't fire oncancel; listen for focus return as a safety net.
    const onWindowFocus = () => {
      window.removeEventListener("focus", onWindowFocus);
      // Give the input's change event time to fire first.
      setTimeout(() => {
        if (!input.files?.length) resolve(null);
      }, 300);
    };
    window.addEventListener("focus", onWindowFocus);

    input.click();
  });
}

/**
 * Triggers a browser download of a text file via a temporary anchor + Blob.
 * Used as the fallback when the File System Access API is unavailable.
 */
function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type SaveJsonResult = {
  /** The file handle written to, or null when the download fallback was used. */
  handle: FileSystemFileHandle | null;
  /** True when the data was written/downloaded; false only if the user cancelled the picker. */
  saved: boolean;
};

/**
 * Writes a JSON string to disk.
 *
 * Uses the File System Access API (Chrome/Edge) when available so the caller can
 * keep a handle for later saves. Falls back to a browser download in browsers that
 * lack it (Firefox, Safari), where no handle can be returned.
 *
 * Pass `existingHandle` to write straight to a previously-picked file (the "Save"
 * case). If that handle can't be written to (e.g. a pseudo-handle from a fallback
 * open), the download fallback is used instead.
 */
export async function saveJsonToFile(
  jsonString: string,
  suggestedName: string,
  existingHandle?: FileSystemFileHandle | null,
): Promise<SaveJsonResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const showSaveFilePicker = (window as any).showSaveFilePicker;
  let handle = existingHandle ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleWritable = handle && typeof (handle as any).createWritable === "function";
  const canUseFileSystemAccess = handleWritable || (!handle && typeof showSaveFilePicker === "function");

  if (canUseFileSystemAccess) {
    if (!handle) {
      handle = await showSaveFilePicker({
        suggestedName,
        types: [{ description: "JSON File", accept: { "application/json": [".json"] } }],
      });
    }
    if (!handle) return { handle: null, saved: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writable = await (handle as any).createWritable();
    await writable.write(jsonString);
    await writable.close();
    return { handle, saved: true };
  }

  // Fallback: browser download (Firefox, Safari)
  downloadTextFile(jsonString, suggestedName, "application/json");
  return { handle: null, saved: true };
}
