/** Anonymous visitor check for the quoted hosted edition. No cookies or sign-in. */
const {chromium}=require('playwright');
const assert=require('assert/strict'),fs=require('fs');
const BASE=process.env.ATLAS_BASE_URL||'https://nik-elon-mechanisms.timsmykov.chatgpt.site/';
(async()=>{const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});const checks=[];try{
 for(const width of [1440,375,320]){
  const c=await b.newContext({viewport:{width,height:1000},isMobile:width<500,hasTouch:width<500});const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(BASE);await p.waitForFunction(()=>window.atlas?.quoteSearchReady,{timeout:60000});
  assert(!/signin|login/.test(p.url()),'Anonymous visitor reached a sign-in page');assert.match(await p.title(),/^Founder Systems/);
  assert.equal(await p.locator('.brand-mark').count(),0,'Old face logo remains');
  assert.match(await p.locator('.brand').textContent(),/Founder Systems/);
  assert.equal(await p.locator('.repository-link').getAttribute('href'),'https://github.com/timsmykov/founder-systems');
  assert.match(await p.locator('.repository-link').getAttribute('aria-label'),/Founder Systems/);
  const bounds=await p.locator('.repository-link').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1,'GitHub link outside viewport');
  const data=await p.evaluate(()=>({cards:atlas.cards.size,relations:atlas.relations.size,quotations:atlas.counts.quotations,body:parseFloat(getComputedStyle(document.querySelector('.result-card p')).fontSize),heading:parseFloat(getComputedStyle(document.querySelector('.result-card h3')).fontSize),overflow:document.documentElement.scrollWidth-innerWidth}));
  assert.equal(data.cards,783);assert.equal(data.relations,249);assert.equal(data.quotations,5098);assert(data.body>=(width<500?18:20));assert(data.heading>=(width<500?20:22));assert(data.overflow<=1);
  for(const theme of ['light','dark']){await p.locator('#theme-select').selectOption(theme);assert.equal(await p.locator('html').getAttribute('data-theme'),theme);}
  await p.locator('.result-card').first().click();await p.locator('.quote').first().waitFor();
  const literal=await p.locator('.quote').first().evaluate(async n=>{const [r]=await atlas.evidence([n.dataset.evidence]);return typeof r.original.text==='string'&&n.querySelector('blockquote')?.textContent===r.original.text;});assert(literal,'Original quotation missing or changed');
  assert.equal(errors.length,0,errors.join('\n'));checks.push({width,...data,anonymous:true,githubLink:true,originalQuotationExact:true,themes:['light','dark'],errors});await c.close();
 }
 const result={status:'passed',origin:BASE,authenticated:false,checks};fs.writeFileSync(process.env.ATLAS_PUBLIC_REPORT||'/tmp/founder-systems-public-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
