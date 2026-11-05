/* Reusable browser regression suite. Pass a Playwright page on the target origin. */
const assert = require('node:assert/strict');
module.exports = async function checkUX(page, base) {
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  const out = [];
  for (const [width,height] of [[1366,768],[1440,900],[1920,1080],[768,1024],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.goto(base);
    await page.waitForFunction(() => window.atlas?.quoteSearchReady, {timeout:60000});
    const result = await page.locator('#results').boundingBox();
    assert(result.height >= 200, `Results collapsed at ${width}x${height}`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}`);
    await page.locator('.result-card').first().click();
    await page.locator('.quote').first().waitFor();
    assert(await page.locator('.quote').first().evaluate(async n => {
      const [row] = await atlas.evidence([n.dataset.evidence]);
      return n.querySelector('blockquote')?.textContent === row.original.text;
    }), 'Quotation changed');
    assert.deepEqual(await page.locator('#reader').evaluate(n => [...n.querySelectorAll(':scope > .detail-section[id]')].map(x => x.id)),
      ['card-quotes','meaning-details','card-connections']);
    out.push({width,height,resultHeight:Math.round(result.height)});
  }
  await page.goto(base);
  await page.waitForFunction(() => window.atlas?.quoteSearchReady, {timeout:60000});
  await page.locator('#search').fill('hiring'); await page.waitForTimeout(300);
  assert.match(await page.locator('#result-count').innerText(), /139 ideas/);
  assert.match(new URL(page.url()).hash, /q=hiring/);
  await page.locator('#search').fill('Garry Tan'); await page.waitForTimeout(300);
  assert.match(await page.locator('.empty-results').innerText(), /coming soon/i);
  await page.locator('#search-clear').click(); await page.locator('#search').blur(); await page.waitForTimeout(300);
  await page.locator('#comparisons-tab').click(); await page.locator('.result-card').first().click();
  await page.locator('.comparison-explainer').waitFor();
  const comparisonURL=page.url();
  await page.goto(comparisonURL); await page.locator('.comparison-explainer').waitFor();
  await page.locator('#relation-nik-quotes .quote').first().waitFor();
  await page.locator('#relation-elon-quotes .quote').first().waitFor();
  const sections = await page.locator('#reader > .detail-section > h3').allTextContents();
  assert(sections.indexOf('Where the approaches differ') < sections.indexOf('Evidence from both collections'), 'Comparison evidence hierarchy changed');
  assert(await page.locator('#reader').evaluate(n => n.classList.contains('mobile-open')));
  await page.locator('.back-button').click(); await page.waitForTimeout(300);
  await page.locator('#graph-tab').click();
  assert.match(await page.locator('#result-count').innerText(), /12 of 257 comparisons shown/);
  assert(await page.locator('#graph-legend').isVisible());
  await page.locator('#graph-scope').click();
  assert.match(await page.locator('#result-count').innerText(), /257 of 257 comparisons/);
  // A one-source filter must retain reviewed cross-source comparisons and
  // display the counterpart endpoints, without inventing relationships.
  await page.goto(new URL('#v=graph&a=nik', base).href);
  await page.waitForFunction(() => window.atlas?.quoteSearchReady, {timeout:60000});
  const graph = await page.evaluate(() => {
    const matching = new Set(atlas.filtered().map(c => c.id));
    const hubs = [...document.querySelectorAll('[data-hub]')].map(n => atlas.relations.get(n.dataset.hub));
    const displayed = new Set([...document.querySelectorAll('[data-node]')].map(n => n.dataset.node));
    return {count: hubs.length, valid: hubs.every(r => r.endpoint_ids.some(id => matching.has(id)) && r.endpoint_ids.every(id => displayed.has(id))),
      hasCounterpart: [...displayed].some(id => atlas.cards.get(id).side === 'elon')};
  });
  assert(graph.count > 0 && graph.valid && graph.hasCounterpart, 'Source filter lost or changed graph connections');
  await page.goto(base);
  await page.waitForFunction(() => window.atlas?.quoteSearchReady, {timeout:60000});
  await page.locator('#meanings-tab').click();
  await page.locator('details.upcoming-founder summary').click();
  assert.equal(await page.locator('.upcoming-founder img[src]').count(),10);
  for (const theme of ['light','dark']) {
    await page.locator('#theme-select').selectOption(theme);
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  }
  assert.deepEqual(problems, []);
  return {viewports:out,search:true,comparisonDeepLink:true,graph:true,portraits:10,themes:true};
};

if (require.main === module) {
  const {chromium} = require('playwright');
  (async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      console.log(JSON.stringify(await module.exports(page, process.env.ATLAS_BASE_URL || 'http://localhost:8080/'), null, 2));
    } finally { await browser.close(); }
  })().catch(error => { console.error(error); process.exitCode=1; });
}
