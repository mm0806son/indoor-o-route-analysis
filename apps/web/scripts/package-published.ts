import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  copyFile,
  stat,
  rm,
} from "node:fs/promises";
import { resolve, join, dirname, relative } from "node:path";
import { createPublicationManifest } from "@indoor-o-route-analysis/core";
import { parseBundle } from "../components/publishing/publication-bundle";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Creates a new upload directory. Never modifies or merges an existing deployment. */
export async function packagePublished(
  input: unknown,
  buildDirectory: string,
  destination: string,
) {
  const bundle = parseBundle(input);
  const source = resolve(buildDirectory);
  const target = resolve(destination);
  const relation = relative(source, target);
  if (!relation || (!relation.startsWith("..") && !relation.startsWith("/")))
    throw new Error("Output must be outside the build directory");
  const html = await readFile(join(source, "index.html"), "utf8");
  if (!/<meta\b[^>]*name="publication-build"[^>]*content="1"/.test(html)) {
    throw new Error(
      "A publication build is required: NEXT_PUBLIC_PUBLISHED_VIEWER=1 pnpm --filter web build",
    );
  }
  // A new directory avoids accidentally retaining withdrawn events or modifying editor builds.
  await mkdir(target, { recursive: false });
  try {
    let count = 0;
    async function copyAsset(path: string) {
      const info = await stat(join(source, path));
      if (info.size > MAX_FILE_BYTES)
        throw new Error(`Cloudflare Pages file exceeds 25 MiB: ${path}`);
      await mkdir(dirname(join(target, path)), { recursive: true });
      await copyFile(join(source, path), join(target, path));
      count++;
    }
    async function copyStatic(directory: string) {
      for (const entry of await readdir(join(source, directory), {
        withFileTypes: true,
      })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await copyStatic(path);
        else if (
          entry.isFile() &&
          !entry.name.endsWith(".map") &&
          /\.(js|mjs|css|woff2?|ttf|png|jpg|jpeg|svg|webp|avif)$/.test(
            entry.name,
          )
        )
          await copyAsset(path);
      }
    }
    await copyAsset("index.html");
    // Next emits /viewer.html by default, or /viewer/index.html with trailingSlash.
    for (const path of [
      "viewer.html",
      "viewer/index.html",
      "pdf.worker.min.mjs",
      "pdf.min.mjs",
      "favicon.ico",
      "favicon-32x32.png",
      "icon.png",
      "apple-touch-icon.png",
      "fonts/Geist-Variable.woff2",
      "fonts/GeistMono-Variable.woff2",
    ]) {
      try {
        await stat(join(source, path));
      } catch {
        continue;
      }
      await copyAsset(path);
    }
    await copyStatic("_next/static");
    const manifest = createPublicationManifest(
      bundle.events,
      bundle.currentEventId,
    );
    const published = join(target, "published");
    await mkdir(published);
    await writeFile(join(published, "manifest.json"), JSON.stringify(manifest));
    for (const event of bundle.events) {
      const item = manifest.events.find(
        (item) => item.eventId === event.eventId,
      )!;
      const text = JSON.stringify(event);
      if (Buffer.byteLength(text) > MAX_FILE_BYTES)
        throw new Error(
          `比赛 ${event.event.name} 超过 25 MiB，请缩小嵌入地图。`,
        );
      const path = resolve(published, item.path);
      if (relative(target, path).startsWith(".."))
        throw new Error("Invalid public event path");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
      count++;
    }
    await writeFile(
      join(target, "_headers"),
      "/\n  Cache-Control: no-cache\n/viewer*\n  Cache-Control: no-cache\n/published/manifest.json\n  Cache-Control: no-store\n/published/events/*\n  Cache-Control: no-cache\n",
    );
    if (count > 990)
      console.warn(
        "More than 990 files: use Wrangler upload instead of dashboard drag-and-drop.",
      );
    return target;
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1]?.endsWith("/package-published.ts")) {
  const [, , bundlePath, destination, buildDirectory = "out"] = process.argv;
  if (!bundlePath || !destination) {
    console.error(
      "Usage: pnpm --filter web package:published <bundle.json> <NEW-output-directory> [build-directory]",
    );
    process.exitCode = 1;
  } else {
    readFile(resolve(bundlePath), "utf8")
      .then((text) =>
        packagePublished(JSON.parse(text), buildDirectory, destination),
      )
      .then((path) => console.log(`Publication ready: ${path}`))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
