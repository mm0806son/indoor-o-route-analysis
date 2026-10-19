import { expect, test, type Page } from "@playwright/test";
import { manifest, publishedA, publishedB } from "./fixtures/publication";

async function servePublication(page: Page, current: string | null = "race-a") {
  await page.route("**/published/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/manifest.json")
      ? { ...manifest, currentEventId: current }
      : path.includes("race-b")
        ? publishedB
        : publishedA;
    return route.fulfill({ json: data });
  });
}

test("fixed viewer loads a published map without opening organizer storage", async ({
  page,
}) => {
  await servePublication(page);
  await page.goto("/viewer");
  await expect(page.getByText("测试赛 A", { exact: true })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-map-ready",
    "true",
  );
  await expect(page.locator(".published-map [role=alert]")).toHaveCount(0);
  const mapDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载地图", exact: true }).click();
  const png = await mapDownload;
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile((await png.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((db) => db.name),
    ),
  ).not.toContain("OrienteeringRouteAnalysis");
  await expect(page.getByText("Graph Editor", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Event Manager", { exact: true })).toHaveCount(0);
});

test("paused publication has a clear empty state", async ({ page }) => {
  await servePublication(page, null);
  await page.goto("/viewer");
  await expect(page.getByText(/暂未开放比赛/)).toBeVisible();
});

test("build, undo, persist and export a personal route without transmitting it", async ({
  page,
}) => {
  await servePublication(page);
  const writes: string[] = [];
  const failures: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.url());
  });
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/viewer");
  await page.getByRole("button", { name: "新建路线 (N)", exact: true }).click();
  await page
    .getByLabel("路线名称", { exact: true })
    .fill("赛后重建 & 我的路线");
  await page.getByRole("button", { name: "采用此赛段", exact: true }).click();
  await expect(page.getByText(/已完成 1\/2 段/)).toBeVisible();
  await page.getByRole("button", { name: "导出 GPX", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/incomplete|完整|完成/);
  await page
    .getByRole("button", { name: "撤销 (Ctrl+Z)", exact: true })
    .click();
  await expect(page.getByText(/已完成 0\/2 段/)).toBeVisible();
  await page
    .getByRole("button", { name: "重做 (Ctrl+Shift+Z)", exact: true })
    .click();
  await page.getByLabel("赛段", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "采用此赛段", exact: true }).click();
  await expect(page.getByText(/已完成 2\/2 段/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("路线名称", { exact: true })).toHaveValue(
    "赛后重建 & 我的路线",
  );
  await expect(page.getByText(/已完成 2\/2 段/)).toBeVisible();
  await page.getByLabel("起跑时间", { exact: true }).fill("2026-10-19T23:59");
  await page.getByLabel("总用时", { exact: true }).fill("120");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 GPX", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.gpx$/);
  const { readFile } = await import("node:fs/promises");
  const xml = await readFile((await download.path())!, "utf8");
  const parsed = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    return {
      errors: document.querySelectorAll("parsererror").length,
      name: document.querySelector("trk > name")?.textContent,
      points: [...document.querySelectorAll("trkpt")].map((p) => ({
        lat: Number(p.getAttribute("lat")),
        lon: Number(p.getAttribute("lon")),
        time: Date.parse(p.querySelector("time")?.textContent ?? ""),
      })),
    };
  }, xml);
  expect(parsed.errors).toBe(0);
  expect(parsed.name).toBe("赛后重建 & 我的路线");
  expect(parsed.points.length).toBeGreaterThanOrEqual(4);
  expect(parsed.points.at(-1)!.time - parsed.points[0].time).toBe(120000);
  expect(
    parsed.points.every(
      (p, i) =>
        Number.isFinite(p.lat) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lon) <= 180 &&
        (!i || p.time > parsed.points[i - 1].time),
    ),
  ).toBe(true);
  expect(writes).toEqual([]);
  expect(failures).toEqual([]);
});

test("event links isolate personal drafts and archived IDs never load", async ({
  page,
}) => {
  await servePublication(page);
  await page.goto("/viewer?event=race-a");
  await page.getByRole("button", { name: "新建路线 (N)", exact: true }).click();
  await page.getByLabel("路线名称", { exact: true }).fill("A only");
  await page.goto("/viewer?event=race-b");
  await expect(page.getByText("测试赛 B", { exact: true })).toBeVisible();
  await expect(page.getByLabel("路线名称", { exact: true })).toHaveCount(0);
  await page.goto("/viewer?event=race-a");
  await expect(page.getByLabel("路线名称", { exact: true })).toHaveValue(
    "A only",
  );
  await page.goto("/viewer?event=private-race");
  await expect(page.locator(".published-viewer [role=alert]")).toContainText(
    /未公开|归档/,
  );
});

test("organizer publishes existing Course Setting JSON and excludes private routes", async ({
  page,
}) => {
  const { testEvent, recommended } = await import("./fixtures/publication");
  const input = structuredClone(testEvent);
  input.raceCourses![0].customRoutes = [
    recommended,
    { ...recommended, id: "private", name: "PRIVATE athlete route" },
  ];
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").click();
  await page.getByRole("button", { name: /赛后发布/ }).click();
  const dialog = page.getByRole("dialog", { name: "赛后发布设置" });
  await dialog
    .getByLabel(/导入线路设计 JSON/)
    .setInputFiles({
      name: "course-setting.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(input)),
    });
  await dialog.getByRole("checkbox", { name: "公开赛程", exact: true }).check();
  await dialog
    .getByRole("checkbox", { name: "组织者推荐", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "加入 / 更新公开包", exact: true })
    .click();
  await expect(
    dialog.getByRole("radio", { name: "当前比赛", exact: true }),
  ).toBeChecked();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载发布包", exact: true }).click();
  const download = await pending;
  const { readFile } = await import("node:fs/promises");
  const contents = await readFile((await download.path())!, "utf8");
  const data = JSON.parse(contents);
  expect(data.currentEventId).toBe("race-a");
  expect(data.events[0].recommendations).toHaveLength(1);
  expect(data.events[0].event.raceCourses[0].customRoutes).toBeUndefined();
  expect(contents).not.toContain("PRIVATE athlete route");
  expect(
    data.events[0].event.raceCourses[0].maps[0].image.encodedData,
  ).toBeTruthy();
});
