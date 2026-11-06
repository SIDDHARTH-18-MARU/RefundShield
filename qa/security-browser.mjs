import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = 'https://127.0.0.1:8443';
const out = new URL(process.env.RESULTS_DIR || './security-results/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = { checks: [], cspViolations: [], externalRequests: [], consoleErrors: [], fontResponses: [] };
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  await context.exposeFunction('recordCsp', value => results.cspViolations.push(value));
  await context.addInitScript(() => window.addEventListener('securitypolicyviolation', event => {
    window.recordCsp({ directive: event.violatedDirective, blocked: event.blockedURI });
  }));
  context.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== base) results.externalRequests.push(request.url());
  });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') results.consoleErrors.push(message.text()); });
  page.on('response', response => { if (response.url().endsWith('.woff2')) results.fontResponses.push({ url: response.url(), status: response.status() }); });
  for (const route of ['/', '/investigations', '/accounts', '/accounts/ACC-1032', '/network', '/threshold', '/scenarios', '/about']) {
    await page.goto(base+route); await page.waitForLoadState('networkidle');
    const fonts = await page.evaluate(async () => {
      await document.fonts.load('500 14px Inter');
      await document.fonts.load('500 14px "JetBrains Mono"');
      return { inter: document.fonts.check('500 14px Inter'), mono: document.fonts.check('500 14px "JetBrains Mono"') };
    });
    assert.deepEqual(fonts, { inter: true, mono: true });
    assert.match(await page.getByRole('region', { name: 'Synthetic workspace' }).innerText(), /Synthetic demo/);
    results.checks.push({ route, fontsLoaded: true, syntheticNotice: true });
  }
  assert.equal(results.externalRequests.length, 0);
  assert.equal(results.cspViolations.length, 0);
  assert.equal(results.consoleErrors.length, 0);
  assert.ok(results.fontResponses.length >= 2 && results.fontResponses.every(r => r.status === 200 && new URL(r.url).origin === base));
  results.passed = true;
} catch (error) {
  results.passed = false; results.failure = error.message;
} finally {
  await fs.writeFile(new URL('results.json', out), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.passed ? 0 : 1;
