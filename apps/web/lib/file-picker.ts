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
