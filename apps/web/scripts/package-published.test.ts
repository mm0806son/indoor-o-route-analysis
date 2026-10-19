// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPublishedEvent,
  type EventData,
} from "@indoor-o-route-analysis/core";
import { packagePublished } from "./package-published";

describe("static publication packaging", () => {
  it("copies only viewer resources and the selected manifest, excluding editor, examples and stale events", async () => {
    const root = await mkdtemp(join(tmpdir(), "publication-test-"));
    try {
      const build = join(root, "out");
      const dest = join(root, "site");
      await mkdir(join(build, "_next/static"), { recursive: true });
      for (const name of [
        "editor.html",
        "sw.js",
        "version.json",
        "private.json",
      ])
        await writeFile(join(build, name), "private");
      await mkdir(join(build, "examples"));
      await writeFile(join(build, "examples/secret.json"), "secret");
      await writeFile(
        join(build, "index.html"),
        '<meta name="publication-build" content="1">viewer',
      );
      await writeFile(join(build, "pdf.worker.min.mjs"), "worker");
      await writeFile(join(build, "_next/static/app.js"), "code");
      await writeFile(join(build, "_next/static/app.js.map"), "source");
      await writeFile(join(build, "_next/static/route.worker.ts"), "source");
      await packagePublished(
        { schemaVersion: 1, currentEventId: null, events: [] },
        build,
        dest,
      );
      expect(await readdir(dest)).toEqual(
        expect.arrayContaining(["index.html", "published", "_headers"]),
      );
      for (const excluded of [
        "editor.html",
        "examples",
        "sw.js",
        "version.json",
        "private.json",
      ])
        expect(await readdir(dest)).not.toContain(excluded);
      expect(await readdir(join(dest, "_next/static"))).toEqual(["app.js"]);
      expect(
        JSON.parse(
          await readFile(join(dest, "published/manifest.json"), "utf8"),
        ).currentEventId,
      ).toBeNull();
      await expect(
        packagePublished(
          { schemaVersion: 1, currentEventId: null, events: [] },
          build,
          dest,
        ),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("writes only explicitly published packages and selected recommendations", async () => {
    const root = await mkdtemp(join(tmpdir(), "publication-test-"));
    try {
      const build = join(root, "out");
      const dest = join(root, "site");
      await mkdir(join(build, "_next/static"), { recursive: true });
      await writeFile(
        join(build, "index.html"),
        '<meta name="publication-build" content="1">',
      );
      const source: EventData = {
        id: "e",
        name: "Public",
        country: "",
        startTime: { date: "2026-10-19" },
        raceCourses: [
          {
            maps: [
              {
                id: "m",
                scale: 1000,
                layout: "horizontal",
                image: { encodedData: "AQID", width: 100, height: 100 },
                mapPositionTopLeft: { x: 0, y: 0 },
              },
            ],
            courses: [
              {
                id: "c",
                name: "C",
                mapId: "m",
                controls: [{ controlId: "S" }, { controlId: "F" }],
              },
            ],
            controls: [
              { id: "S", type: "start", mapPosition: { x: 0, y: 0 } },
              { id: "F", type: "finish", mapPosition: { x: 1, y: 1 } },
            ],
            edges: [{ from: "S", to: "F", label: "" }],
            customRoutes: [
              {
                id: "secret",
                name: "PRIVATE_ROUTE",
                courseId: "c",
                legs: [
                  {
                    fromControlId: "S",
                    toControlId: "F",
                    path: [{ nodeId: "S" }, { nodeId: "F" }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const event = createPublishedEvent(source, {
        eventId: "public",
        revision: "v1",
        courseIds: ["c"],
      });
      await packagePublished(
        { schemaVersion: 1, currentEventId: "public", events: [event] },
        build,
        dest,
      );
      expect(await readdir(join(dest, "published/events"))).toEqual(["public"]);
      const data = await readFile(
        join(dest, "published/events/public/v1.json"),
        "utf8",
      );
      expect(data).not.toContain("PRIVATE_ROUTE");
      expect(JSON.parse(data).recommendations).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects output nested in the source tree", async () => {
    await expect(
      packagePublished(
        { schemaVersion: 1, currentEventId: null, events: [] },
        "/tmp/build",
        "/tmp/build/_next/static/site",
      ),
    ).rejects.toThrow(/outside/);
  });
  it("removes partial output on an oversized asset", async () => {
    const root = await mkdtemp(join(tmpdir(), "publication-test-"));
    try {
      const build = join(root, "out");
      const dest = join(root, "site");
      await mkdir(build);
      await writeFile(
        join(build, "index.html"),
        '<meta name="publication-build" content="1">',
      );
      await writeFile(
        join(build, "pdf.worker.min.mjs"),
        Buffer.alloc(25 * 1024 * 1024 + 1),
      );
      await expect(
        packagePublished(
          { schemaVersion: 1, currentEventId: null, events: [] },
          build,
          dest,
        ),
      ).rejects.toThrow(/25 MiB/);
      await expect(readdir(dest)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("refuses a normal editor build before creating output", async () => {
    const root = await mkdtemp(join(tmpdir(), "publication-test-"));
    try {
      await writeFile(join(root, "index.html"), "editor");
      await expect(
        packagePublished(
          { schemaVersion: 1, currentEventId: null, events: [] },
          root,
          join(root, "../missing-publication-site"),
        ),
      ).rejects.toThrow(/publication/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
