// 冒険マップの見た目を確かめる（縦・横）
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const API = 'http://localhost:8791', APP = 'http://localhost:8792/app/index.html', OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [nm, vp] of [['横', { width: 1180, height: 820 }], ['縦', { width: 820, height: 1180 }]]) {
    const c = await b.newContext({ viewport: vp, serviceWorkers: 'block' });
    await c.route('**/app/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.APP_CONFIG={GAS_LOGIN_URL:'${API}/login',GAS_API_URL:'${API}/api',DEADLINE:'2027-01-13'};` }));
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(APP); await p.click('#login'); await p.waitForSelector('#toMap'); await p.click('#toMap'); await p.waitForSelector('.mapsvg');
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/マップ_${nm}.png`, fullPage: true });
  }
  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'なし'); await b.close();
})();
