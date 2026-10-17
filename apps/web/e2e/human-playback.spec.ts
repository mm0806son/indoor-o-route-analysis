import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Synthetic event: f ranks first, but Y immediately connects to the control.
// No private event data, external service or deployment image is required.
async function checkFrame(page: Page, index: number) {
  const active = page.locator('[aria-current="step"]');
  await expect(page.getByText(`Step ${index + 1} / 3`, { exact: true })).toBeVisible();
  const messages = [
    /Same floor\? No/,
    /Stair Y connects the start-side and target-side paths, so choose Y\./,
    /The start and control are now connected\. Route: Y\. Go!/,
  ];
  await expect(active).toHaveText(messages[index]);
  // isVisible alone would miss clipping inside the sidebar scroll viewport.
  await expect.poll(() => active.evaluate(el => {
    const r = el.getBoundingClientRect();
    const viewport = el.closest('[data-radix-scroll-area-viewport]')?.getBoundingClientRect();
    return !!viewport && r.height > 0 && r.top >= viewport.top - 1
      && r.bottom <= viewport.bottom + 1 && r.top >= 0 && r.bottom <= innerHeight;
  })).toBe(true);
  const details = await page.getByTestId('human-playback-details').boundingBox();
  expect(details?.height).toBeGreaterThanOrEqual(120);
  await expect(page.getByTestId('labs-route-path')).toHaveCount(index === 2 ? 1 : 0);
  if (index === 2) await expect(page.getByTestId('labs-route-path').locator('polyline').first()).toBeAttached();
  await expect(page.getByTestId('labs-leg-controls').locator('circle').first()).toBeAttached();
  await expect(page.getByTitle('Next step (→)')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'JSON', exact: true })).toBeInViewport();
  await expect(page.getByText('Short-term memory', { exact: true })).toHaveCount(index === 1 ? 1 : 0);
  const selected = page.locator('[data-human-candidate][data-chosen="true"]');
  if (index === 1) {
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute('data-human-candidate', 'Y');
    await expect(selected.locator('polyline')).toHaveCount(1);
    await expect(page.locator('[data-human-candidate="f"]')).toHaveAttribute('data-chosen', 'false');
    const memory = page.getByText('Short-term memory', { exact: true }).locator('..');
    await expect(memory.locator('.font-mono')).toHaveText(['—', '—']);
  } else {
    await expect(selected).toHaveCount(0);
  }
}

for (const viewport of [{ width: 1440, height: 731 }, { width: 2160, height: 1097 }]) {
  test(`human playback stays consistent at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => Reflect.deleteProperty(window, 'showOpenFilePicker'));
    await page.goto('/labs');
    await page.locator('button:has(svg.lucide-menu)').click();
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open...', exact: true }).click();
    await (await choosing).setFiles(path.join(__dirname, 'fixtures/human-playback.json'));
    await expect(page.getByText('Human playback regression', { exact: true }).first()).toBeVisible();
    await page.goto('/labs');
    await page.getByRole('combobox').filter({ hasText: 'Most difficult' }).click();
    await page.getByRole('option', { name: /Human thinking/ }).click();
    await checkFrame(page, 0);
    await expect(page.getByTitle('Previous step (←)')).toBeDisabled();
    await page.getByTitle('Next step (→)').click();
    await checkFrame(page, 1);
    await page.getByTitle('Next step (→)').click();
    await checkFrame(page, 2);
    await expect(page.getByTitle('Next step (→)')).toBeDisabled();
    await page.getByText('Cognitive effort score', { exact: true }).scrollIntoViewIfNeeded();
    await page.getByTitle('Previous step (←)').click();
    await checkFrame(page, 1);
    await page.keyboard.press('ArrowRight');
    await checkFrame(page, 2);
    await page.keyboard.press('ArrowLeft');
    await checkFrame(page, 1);
    await page.keyboard.press('ArrowLeft');
    await checkFrame(page, 0);
    // Advance the real playback timer deterministically, without racing the UI.
    await page.clock.install();
    await page.getByTitle('Play (Space)').click();
    await page.clock.runFor(1600);
    await checkFrame(page, 1);
    await page.getByTitle('Pause (Space)').click();
    await page.clock.runFor(4000);
    await checkFrame(page, 1);
    await page.keyboard.press('Space');
    await page.clock.runFor(1600);
    await checkFrame(page, 2);
    await expect(page.getByTitle('Play (Space)')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
