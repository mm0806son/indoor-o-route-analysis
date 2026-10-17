import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const base = process.env.RELEASE_URL || 'http://100.65.222.38:18083';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
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
  assert.equal((await (await page.request.get(`${base}/version.json`)).json()).version, '0.2.1');
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
    while (await page.getByTitle('Next step (→)').isEnabled()) await page.getByTitle('Next step (→)').click();
    if (process.env.SCREENSHOT_FILE) await page.screenshot({ path: process.env.SCREENSHOT_FILE });
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

    if (process.env.SCREENSHOT_FILE) await page.screenshot({ path: process.env.SCREENSHOT_FILE });
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
