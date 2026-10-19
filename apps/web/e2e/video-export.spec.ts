import { expect, test } from "@playwright/test";

/**
 * Regression test for the full-course video export.
 *
 * The export publishes a combined all-legs route through `overrideRoutesRef`
 * and then forces a re-render. `displayedRoutes` used to be a `useMemo` keyed
 * only on `[routes, selectedRoute]`, so it never observed that ref and the
 * renderer kept whatever it had before the export started. With no leg
 * selected that was an empty list, the playback branch was skipped entirely,
 * and the export produced a completely static video — every frame identical.
 *
 * The runner circle only exists while the playback branch runs, so asserting
 * it appears during a Full Course export pins the behaviour without decoding
 * the resulting video.
 */

const EXAMPLE_EVENT_NAME = /Fossum/i;
const EXAMPLE_COURSE_NAME = "Lett";

test("full course video export animates the runner with no leg selected", async ({ page }) => {
  // Headless Chromium exposes showSaveFilePicker but cannot present the
  // picker, which would stall the export on a dialog that never resolves.
  // Removing it takes the exporter's own fallback path, as a browser without
  // the File System Access API would.
  await page.addInitScript(() => {
    // biome-ignore lint/performance/noDelete: removing the capability is the point
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });

  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(EXAMPLE_EVENT_NAME).click();
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /^Route Analysis$/ }).click();
  await page.getByText("Select a course to analyze").click();
  await page.getByRole("option", { name: EXAMPLE_COURSE_NAME, exact: true }).click();

  // Deliberately do NOT select a leg — that is the case that regressed.
  await expect(page.getByText(/^D\d+$/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("button", { name: "Export video..." }).click();

  const fullCourse = page.getByRole("button", { name: /Full Course/ });
  await expect(fullCourse).toBeVisible();
  await fullCourse.click();

  // Smallest offered frame keeps the export short; the defect is independent
  // of resolution.
  await page.getByRole("button", { name: "Export", exact: true }).click();

  await expect(page.locator('[data-testid="playback-runner"]')).toBeAttached({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Cancel Export" }).click();
});
