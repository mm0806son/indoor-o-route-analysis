import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const base = process.env.RELEASE_URL || 'http://100.65.222.38:18083';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: Number(process.env.VIEWPORT_WIDTH || 1440), height: Number(process.env.VIEWPORT_HEIGHT || 731) }, deviceScaleFactor: Number(process.env.DEVICE_SCALE || 1.5) });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => Reflect.deleteProperty(window, 'showOpenFilePicker'));
  await page.goto(`${base}/labs?version=1017-human-route`);
  await page.getByLabel('应用版本').waitFor();
  for (const release of ['1017-stairs', '0804b', '1017-human-route']) {
    await page.getByLabel('应用版本').selectOption(release);
    await page.waitForURL(url => url.searchParams.get('version') === release);
    await page.getByLabel('应用版本').waitFor();
    assert.equal((await (await page.request.get(`${base}/__releases/current`)).json()).release, release);
  }
  await page.goto(`${base}/labs`);
  await page.getByLabel('应用版本').waitFor();
  assert.equal(await page.getByLabel('应用版本').inputValue(), '1017-human-route');
  assert.equal((await (await page.request.get(`${base}/version.json`)).json()).version, '0.2.3');
  if (process.env.TEST_EVENT_FILE) {
    await page.locator('button:has(svg.lucide-menu)').click();
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open...', exact: true }).click();
    await (await choosing).setFiles(process.env.TEST_EVENT_FILE);
    await page.getByText(/Wangfujing/i).first().waitFor();
    await page.goto(`${base}/labs`);
    await page.getByRole('combobox').filter({ hasText: 'Most difficult' }).click();
    await page.getByRole('option', { name: /Human thinking/ }).click();
    const course = page.getByRole('combobox').filter({ hasText: /MW21E/ });
    if (!await course.count()) {
      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'MW21E', exact: true }).click();
    }
    await page.getByRole('combobox').filter({ hasText: /→/ }).click();
    await page.getByRole('option', { name: '2 → 3', exact: true }).click();
    await page.getByTitle('Next step (→)').waitFor();
    assert.equal(await page.getByText('No route found for this leg.', { exact: true }).count(), 0);
    // Inspect the local export blob; no event data leaves the browser.
    await page.evaluate(() => {
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        if (blob.type === 'application/json') window.humanRouteExport = blob.text();
        return create(blob);
      };
    });
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const bundle = JSON.parse(await page.evaluate(() => window.humanRouteExport));
    assert.equal(bundle.leg.fromControlId, '32');
    assert.equal(bundle.leg.toControlId, '52');
    assert.ok(Math.abs(bundle.result.route.distance - 177.06246326940612) < 1e-6);
    assert.deepEqual([...bundle.result.forwardLabels, ...bundle.result.backwardLabels], ['Y']);
    assert.equal(bundle.effort.planDepth, 1);
    assert.ok(bundle.result.explorationTrace.every(s => s.candidates.every(c => c.label)));

    assert.equal(bundle.explanation.length, 3);
    const step = bundle.result.explorationTrace[0];
    assert.equal(step.side, 'tracking');
    assert.equal(step.completesRoute, true);
    assert.equal(step.candidates[0].label, 'f');
    const chosen = step.candidates[step.chosenCandidateIndex];
    assert.equal(chosen.label, 'Y');
    assert.ok(chosen.path.some((id, i) => id === '1212' && chosen.path[i + 1] === '1211'));
    assert.deepEqual(step.memory.forwardChain, []);
    assert.deepEqual(step.memory.backwardChain, []);
    assert.match(bundle.explanation[1].text, /Stair Y connects.*choose Y/);
    assert.ok(!bundle.explanation.some(e => /try.* f\.|worked out from the control/.test(e.text)));

    const checkFrame = async index => {
      const active = page.locator('[aria-current="step"]');
      await expect(active).toHaveText(bundle.explanation[index].text);
      // Visibility must include clipping, not merely DOM presence or nonzero size.
      await expect.poll(async () => active.evaluate(el => {
        const r = el.getBoundingClientRect();
        const viewport = el.closest('[data-radix-scroll-area-viewport]')?.getBoundingClientRect();
        return !!viewport && r.height > 0 && r.top >= viewport.top - 1 && r.bottom <= viewport.bottom + 1
          && r.top >= 0 && r.bottom <= window.innerHeight;
      })).toBe(true);
      const details = await page.getByTestId('human-playback-details').boundingBox();
      assert.ok(details.height >= 120, 'Explanation area must retain usable height');
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
        assert.equal(await memory.locator('.font-mono').allTextContents().then(a => a.join('|')), '—|—');
      } else {
        await expect(selected).toHaveCount(0);
      }
      if (process.env.SCREENSHOT_FILE) await page.screenshot({ path: process.env.SCREENSHOT_FILE.replace(/\.png$/, `-step-${index + 1}.png`) });
      console.log(`PASS: frame ${index + 1}: ${bundle.explanation[index].text}`);
    };
    await checkFrame(0);
    await page.getByTitle('Next step (→)').click();
    await checkFrame(1);
    await page.getByTitle('Next step (→)').click();
    await checkFrame(2);
    await expect(page.getByTitle('Next step (→)')).toBeDisabled();
    // Scrolling to the summary must not prevent the next active explanation coming into view.
    await page.getByText('Cognitive effort score', { exact: true }).scrollIntoViewIfNeeded();
    await page.getByTitle('Previous step (←)').click();
    await checkFrame(1);
    await page.keyboard.press('ArrowRight');
    await checkFrame(2);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await checkFrame(0);
    await page.getByTitle('Play (Space)').click();
    await expect(page.getByText('Step 2 / 3', { exact: true })).toBeVisible({ timeout: 10000 });
    await checkFrame(1);
    await expect(page.getByText('Step 3 / 3', { exact: true })).toBeVisible({ timeout: 10000 });
    await checkFrame(2);
    await page.getByRole('button', { name: 'Route Analysis', exact: true }).click();
    await page.getByRole('combobox').filter({ hasText: /Select a course|MW21E/ }).click();
    await page.getByRole('option', { name: /MW21E/ }).click();
    await page.getByRole('button').filter({ hasText: /2.*3/ }).first().click();
    assert.match(await page.locator('body').innerText(), /177/);
    console.log('PASS: Wangfujing MW21E 2 → 3, route, playback, export and Route Analysis');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: three release versions, persistence, metadata, zero browser errors');
} finally {
  await browser.close();
}
