import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const base = process.env.RELEASE_URL || 'http://100.65.222.38:18082';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  await page.addInitScript(()=>Reflect.deleteProperty(window,'showOpenFilePicker'));
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.goto(`${base}/stairs?version=1017-stairs`);
  await page.getByRole('button',{name:'Stairs',exact:true}).waitFor();
  if (!await page.evaluate(()=>typeof crypto.randomUUID === 'function')) throw new Error('HTTP UUID compatibility missing');
  await page.getByLabel('应用版本').selectOption('0804b');
  await page.waitForURL(url=>url.searchParams.get('version')==='0804b');
  await page.waitForLoadState('load');
  await page.getByLabel('应用版本').waitFor();
  if(await page.getByRole('button',{name:'Stairs',exact:true}).count()) throw new Error('Old release unexpectedly contains Stairs');
  await page.getByLabel('应用版本').selectOption('1017-stairs');
  await page.waitForURL(url=>url.searchParams.get('version')==='1017-stairs');
  await page.getByRole('button',{name:'Stairs',exact:true}).waitFor();
  await page.goto(`${base}/stairs`);
  await page.getByRole('button',{name:'Stairs',exact:true}).waitFor();
  const response=await page.request.get(`${base}/__releases/current`);
  if((await response.json()).release!=='1017-stairs') throw new Error('Release preference not persisted');
  if(process.env.TEST_EVENT_FILE) {
    await page.locator('button:has(svg.lucide-menu)').click();
    const chooserPromise=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'Open...',exact:true}).click();
    const chooser=await chooserPromise;await chooser.setFiles(process.env.TEST_EVENT_FILE);
    await page.getByText(/Wangfujing/i).first().waitFor();
    await page.getByRole('button',{name:'Stairs',exact:true}).click();
    await page.getByLabel('Stair highlight').selectOption('A1');
    await page.getByText('Diagnostics (0)',{exact:true}).waitFor();
    if(await page.getByLabel('Stair map highlights').getAttribute('data-stair-code')!=='A1') throw new Error('Imported stair highlighting failed');
  }
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: new release, old release, switch back, preference persistence, no browser errors');
} finally {await browser.close();}
