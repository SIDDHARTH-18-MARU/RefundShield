import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keep release regression artifacts separate from the Phase 1 evidence.
const out = new URL(process.env.RESULTS_DIR || './results/', import.meta.url);
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
if (!/^(http:\/\/127\.0\.0\.1:(5173|4173)|https:\/\/127\.0\.0\.1:8443)$/.test(base)) throw new Error('QA is restricted to approved loopback test ports');
const browserName = process.env.BROWSER || 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
if (!engine) throw new Error('Unknown browser engine');
const channel = process.env.BROWSER_CHANNEL || (browserName === 'chromium' ? 'chrome' : undefined);
if (channel && !['chrome', 'msedge'].includes(channel)) throw new Error('Unknown browser channel');
const contextOptions = { viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ignoreHTTPSErrors: base.startsWith('https://') };
await fs.mkdir(out, { recursive: true });
const browser = await engine.launch({ ...(browserName === 'chromium' && channel ? { channel } : {}), headless: true });
const results = { startedAt: new Date().toISOString(), browserName, channel, browserVersion: browser.version(), localSelfSignedTLS: base.startsWith('https://'), checks: [], accessibility: [], pageErrors: [], consoleErrors: [] };
const context = await browser.newContext(contextOptions);
const page = await context.newPage();
page.on('pageerror', error => results.pageErrors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') results.consoleErrors.push(msg.text()); });
const check = async (name, run) => {
  try { await run(); results.checks.push({ name, passed: true }); console.log('PASS', name); }
  catch (error) { results.checks.push({ name, passed: false, error: error.message }); console.log('FAIL', name); await page.screenshot({ path: fileURLToPath(new URL(`failure-${results.checks.length}.png`, out)) }).catch(() => {}); }
  await fs.writeFile(new URL('browser-results.json', out), JSON.stringify(results, null, 2));
};
const ready = async () => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  // Observe the application's loading contract as well as the browser signal.
  await page.waitForFunction(() => !document.querySelector('main .animate-pulse'), undefined, { timeout: 20000 });
};
try {
  await check('Dashboard live API, synthetic notice and baseline', async () => {
    await page.goto(base); await ready();
    await page.getByRole('heading', { name: 'Investigation overview', exact: true }).waitFor();
    assert.match(await page.locator('main').innerText(), /0 locally reviewed/);
    assert.equal((await page.request.get(`${base}/api/health`)).status(), 200);
  });
  await check('Local actions, notes, reload and disabled mutation endpoint', async () => {
    await page.goto(`${base}/investigations/RET-7137`); await ready();
    await page.getByLabel('Case notes', { exact: false }).fill('Synthetic review of shared-device evidence.');
    await page.getByRole('button', { name: 'Save notes', exact: true }).click(); await ready();
    await page.getByRole('button', { name: 'Escalate for Investigation', exact: true }).click(); await ready();
    assert.match(await page.locator('main').innerText(), /Escalated for investigation/);
    await page.reload(); await ready();
    assert.equal(await page.getByLabel('Case notes', { exact: false }).inputValue(), 'Synthetic review of shared-device evidence.');
    assert.equal((await page.request.post(`${base}/api/investigations/RET-7137/action`, { data: { action: 'review' } })).status(), 405);
  });
  await check('Dashboard and queue agree with local case state', async () => {
    await page.goto(base); await ready();
    assert.match(await page.locator('main').innerText(), /1 locally reviewed/);
    await page.goto(`${base}/investigations`); await ready();
    await page.getByLabel('Filter investigations').fill('RET-7137');
    assert.match(await page.locator('main').innerText(), /Escalated for investigation/);
  });
  await check('Independent visitor and scenario overlays', async () => {
    const other = await browser.newContext(contextOptions); const otherPage = await other.newPage();
    await otherPage.goto(`${base}/investigations/RET-7137`); await otherPage.waitForLoadState('networkidle');
    assert.equal(await otherPage.getByLabel('Case notes', { exact: false }).inputValue(), '');
    assert.match(await otherPage.locator('main').innerText(), /Awaiting review/);
    await other.close();
    await page.evaluate(() => sessionStorage.setItem('refundshield.scenario', 'household'));
    await page.goto(base); await ready(); assert.match(await page.locator('main').innerText(), /0 locally reviewed/);
    await page.evaluate(() => sessionStorage.setItem('refundshield.scenario', 'coordinated'));
    await page.reload(); await ready(); assert.match(await page.locator('main').innerText(), /1 locally reviewed/);
  });
  await check('Scenario reset restores baseline, notes and reload', async () => {
    await page.getByRole('button', { name: 'Reset scenario workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm reset', exact: true }).click(); await ready();
    // WebKit can settle its network-idle signal before React's subscribed
    // dashboard refresh completes. Wait for the required visible result.
    await page.locator('main').getByText(/0 locally reviewed/).waitFor({ timeout: 20000 });
    assert.match(await page.locator('main').innerText(), /0 locally reviewed/);
    await page.goto(`${base}/investigations/RET-7137`); await ready();
    assert.equal(await page.getByLabel('Case notes', { exact: false }).inputValue(), '');
  });
  await check('Existing JSON export downloads synthetic local summary', async () => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export summary', exact: true }).click(),
    ]);
    await file.saveAs(fileURLToPath(new URL('summary.json', out)));
    const data = JSON.parse(await fs.readFile(new URL('summary.json', out), 'utf8'));
    assert.match(data.environment, /Synthetic/); assert.equal(data.case_state.notes, '');
    assert.ok(Array.isArray(data.local_simulation_history));
  });
  await check('Router upgrade: deep link, internal link and history restore', async () => {
    await page.goto(`${base}/investigations/RET-7137`); await ready();
    const accountLink = page.getByRole('link', { name: 'Open account investigation', exact: true });
    const accountPath = await accountLink.getAttribute('href');
    assert.match(accountPath, /^\/accounts\/ACC-\d+$/);
    await accountLink.click(); await ready();
    assert.equal(new URL(page.url()).pathname, accountPath);
    await page.reload(); await ready();
    assert.equal(await page.locator('main h1').count(), 1);
    await page.goBack(); await ready();
    assert.match(page.url(), /\/investigations\/RET-7137$/);
    await page.goForward(); await ready();
    assert.equal(new URL(page.url()).pathname, accountPath);
  });
  await check('Router upgrade: cluster query survives reload', async () => {
    await page.goto(`${base}/network?cluster=C-011`); await ready();
    await page.reload(); await ready();
    assert.equal(new URL(page.url()).searchParams.get('cluster'), 'C-011');
    assert.match(await page.locator('main').innerText(), /C-011/);
    assert.ok(await page.getByRole('button', { name: /^Account ACC/ }).count());
  });
  await check('Router upgrade: unknown route has keyboard-accessible recovery', async () => {
    await page.goto(`${base}/no-such-route`); await ready();
    await page.getByRole('heading', { name: 'Page not found' }).waitFor();
    const link = page.getByRole('link', { name: 'Return to overview', exact: true });
    await link.focus(); await page.keyboard.press('Enter'); await ready();
    assert.equal(new URL(page.url()).pathname, '/');
    await page.getByRole('heading', { name: 'Investigation overview', exact: true }).waitFor();
  });
  await check('Read-only API and invalid input through frontend proxy', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await page.request.fetch(`${base}/api/investigations/RET-7137/notes`, { method, data: { notes: 'synthetic' } })).status(), 405);
    }
    for (const query of ['threshold=NaN', 'threshold=0', 'scenario=unknown', 'scenario=coordinated&scenario=household']) {
      assert.ok([404, 422].includes((await page.request.get(`${base}/api/dashboard?${query}`)).status()));
    }
  });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/', '/investigations', '/accounts', '/accounts/ACC-1032', '/network', '/threshold', '/scenarios', '/about']) {
      await check(`${width}px route ${route}`, async () => {
        await page.goto(base + route); await ready();
        assert.equal(await page.locator('main h1').count(), 1);
        assert.ok(!(await page.locator('main').innerText()).includes('Something went wrong'));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, 'page must not overflow horizontally');
        const name = `${width}-${route.replaceAll('/', '-') || 'overview'}`;
        await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, out)), fullPage: true });
        if (width === 1440) {
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          results.accessibility.push({ route, violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, example: v.nodes[0]?.html })) });
        }
      });
    }
  }
  await check('Mobile drawer keyboard focus and Escape', async () => {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true }); await dialog.waitFor();
    await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  });
  await check('Global search and keyboard graph selection', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('Global search', { exact: true }).fill('ACC-1032'); await ready();
    await page.getByRole('option', { name: /ACC-1032/ }).click(); await ready(); assert.match(page.url(), /accounts\/ACC-1032/);
    await page.goto(`${base}/network`); await ready();
    const node = page.getByRole('button', { name: /^Account ACC/ }).first();
    await node.focus(); await page.keyboard.press('Enter'); await ready();
    assert.ok((await page.locator('main').innerText()).includes('Return rate'));
  });
  await check('Threshold slider, keyboard bin inspection and bounded sweep', async () => {
    await page.goto(`${base}/threshold`); await ready();
    await page.getByLabel('Review threshold percentage').fill('22'); await ready();
    await page.getByLabel('Inspect return-rate bin').selectOption({ index: 1 }); await ready();
    await page.getByRole('button', { name: 'Close bin detail', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Run sweep', exact: true }).click();
    await page.getByRole('button', { name: 'Re-run', exact: true }).waitFor({ timeout: 20000 });
  });
  await check('Scenario comparison and existing CSV export', async () => {
    await page.goto(`${base}/scenarios`); await ready();
    await page.getByRole('button', { name: 'Compare scenarios', exact: true }).click();
    await page.getByRole('button', { name: 'CSV', exact: true }).waitFor({ timeout: 20000 });
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV', exact: true }).click(),
    ]);
    await file.saveAs(fileURLToPath(new URL('comparison.csv', out)));
    const csv = await fs.readFile(new URL('comparison.csv', out), 'utf8');
    assert.equal(csv.split('\r\n').length, 5); assert.match(csv, /Coordinated/);
  });
  await check('Empty investigations filter and recovery', async () => {
    await page.goto(`${base}/investigations`); await ready();
    await page.getByLabel('Filter investigations').fill('NO-SUCH-SYNTHETIC-CASE');
    await page.getByRole('heading', { name: 'No investigations match your filters.' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.ok(await page.getByRole('table').count());
  });
  await check('Backend failure feedback and retry', async () => {
    await page.route('**/api/investigation-queue*', route => route.fulfill({ status: 503, body: '{}' }));
    await page.goto(`${base}/investigations`); await ready();
    await page.getByRole('button', { name: /retry|try again/i }).waitFor();
    await page.unroute('**/api/investigation-queue*');
    await page.getByRole('button', { name: /retry|try again/i }).click(); await ready();
    assert.ok(await page.getByRole('table').count());
  });
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  for (const route of ['/', '/investigations', '/accounts', '/accounts/ACC-1032', '/network', '/threshold', '/scenarios', '/about']) {
    await check(`Dark theme ${route}`, async () => {
      await page.goto(base + route); await ready();
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      results.accessibility.push({ route: `dark:${route}`, violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, example: v.nodes[0]?.html })) });
      await page.screenshot({ path: fileURLToPath(new URL(`dark-${route.replaceAll('/', '-') || 'overview'}.png`, out)), fullPage: true });
    });
  }
  await check('Corrupt storage recovery notice and reset', async () => {
    await page.evaluate(() => sessionStorage.setItem('refundshield.workspace.v1', '{broken'));
    await page.goto(base); await ready();
    assert.match(await page.getByRole('region', { name: 'Synthetic workspace' }).innerText(), /could not be read/);
    await page.getByRole('button', { name: 'Reset scenario workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm reset', exact: true }).click(); await ready();
    assert.ok(!(await page.getByRole('region', { name: 'Synthetic workspace' }).innerText()).includes('could not be read'));
  });
} finally {
  await fs.writeFile(new URL('browser-results.json', out), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.checks.some(c => !c.passed) || results.pageErrors.length || results.accessibility.some(a => a.violations.length) ? 1 : 0;
