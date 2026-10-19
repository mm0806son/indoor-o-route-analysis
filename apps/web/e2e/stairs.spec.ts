import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
const fixture = JSON.parse(
  readFileSync(
    resolve("../../packages/core/src/__fixtures__/wangfujing-stairs.json"),
    "utf8",
  ),
);
const pdf = new jsPDF({ format: [320, 450] });
pdf.text("Stair test map", 20, 20);
fixture.maps = [
  {
    id: "stairs-map",
    scale: 1000,
    layout: "horizontal",
    image: {
      width: 320,
      height: 450,
      mediaType: "application/pdf",
      encodedData: Buffer.from(pdf.output("arraybuffer")).toString("base64"),
    },
    mapPositionTopLeft: { x: 0, y: 0 },
  },
];
if (process.env.STAIRS_EVENT_FILE) {
  Object.assign(
    fixture,
    JSON.parse(readFileSync(process.env.STAIRS_EVENT_FILE, "utf8"))
      .raceCourses[0],
  );
}
async function seed(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
  await page.goto("/");
  await page.evaluate(async (race) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("OrienteeringRouteAnalysis", 6);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("events", "readwrite");
      tx.objectStore("events").put({
        id: "stairs-test",
        name: "Wangfujing stairs",
        startTime: { date: "2026-10-18" },
        country: "",
        raceCourses: [race],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem("app-selected-event", "stairs-test");
  }, fixture);
  await page.goto("/stairs");
  await expect(
    page.getByRole("textbox", { name: "Floor order", exact: true }),
  ).toBeVisible();
}
async function stored(page: Page) {
  const downloaded = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const download = await downloaded;
  const path = await download.path();
  return JSON.parse(readFileSync(path!, "utf8")).raceCourses[0];
}
test("real graph conversion, floor persistence and both stair highlights", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seed(page);
  await page
    .getByRole("textbox", { name: "Floor order", exact: true })
    .fill("-2,-1,1,2,3,4,5");
  await page
    .getByRole("button", { name: "Save floor order", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Convert legacy stairs", exact: true })
    .click();
  await expect(page.getByLabel("Stair highlight")).toContainText("A1");
  await page.getByLabel("Stair highlight").selectOption("A1");
  await expect(page.getByLabel("Stair map highlights")).toHaveAttribute(
    "data-stair-code",
    "A1",
  );
  await expect(page.getByText("Loading map...", { exact: true })).toBeHidden({
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Fit stairs", exact: true }).click();
  // Wait for the map's frame animation to settle before capturing the real PDF.
  if (process.env.STAIRS_EVENT_FILE) {
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "/tmp/wangfujing-stairs-view.png",
      fullPage: true,
    });
  }
  const converted = await stored(page);
  expect(converted.edges).toEqual(fixture.edges);
  expect(converted.vertices.filter((n: any) => n.stair).length).toBeGreaterThan(
    100,
  );
  await page
    .getByRole("button", { name: "Course Setting", exact: true })
    .click();
  await page.getByLabel("Stair highlight").selectOption("A1");
  await expect(page.getByLabel("Stair map highlights")).toHaveAttribute(
    "data-stair-code",
    "A1",
  );
  await stored(page);
  await page.reload();
  await page.getByRole("button", { name: "Stairs", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Floor order", exact: true }),
  ).toHaveValue("-2, -1, 1, 2, 3, 4, 5");
  await expect(page.getByLabel("Stair highlight")).toContainText("A1");
});
test("annotate, connect by click, disconnect, save without reconnecting, undo", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seed(page);
  await page
    .getByRole("textbox", { name: "Floor order", exact: true })
    .fill("-2,-1,1,2,3,4,5");
  await page
    .getByRole("button", { name: "Save floor order", exact: true })
    .click();
  await page.getByText("Graph nodes (591)", { exact: true }).click();
  for (const [id, floor, code] of [
    ["1001", "1", "Z9"],
    ["1002", "2", "z9"],
  ]) {
    await page.getByLabel("Select graph node").selectOption(id);
    await page.getByLabel("Stair code", { exact: true }).fill(code);
    await page.getByLabel("Stair floor", { exact: true }).selectOption(floor);
    await page.getByRole("button", { name: "Save stair", exact: true }).click();
  }
  // Existing ordinary edge must not be silently replaced.
  await page
    .getByRole("button", { name: "Connect selected stair by click" })
    .click();
  await page.getByLabel("Select graph node").selectOption("1001");
  await expect(
    page.getByRole("status").filter({ hasText: "already connects" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Disconnect 1001 1002", exact: true })
    .click();
  await page.getByRole("button", { name: "Save stair", exact: true }).click();
  expect(
    (await stored(page)).edges.some(
      (e: any) => e.from === "1001" && e.to === "1002",
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Save and connect stair", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).edges.find(
          (e: any) => e.from === "1001" && e.to === "1002",
        )?.label,
    )
    .toBe("Z9");
  await page
    .getByRole("button", { name: "Disconnect 1001 1002", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect selected stair by click" })
    .click();
  await page.getByLabel("Select graph node").selectOption("1002");
  await expect
    .poll(
      async () =>
        (await stored(page)).edges.find(
          (e: any) => e.from === "1001" && e.to === "1002",
        )?.label,
    )
    .toBe("Z9");
  await page
    .getByRole("button", { name: "Undo stair operation", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await stored(page)).edges.some(
        (e: any) => e.from === "1001" && e.to === "1002",
      ),
    )
    .toBe(false);
});
