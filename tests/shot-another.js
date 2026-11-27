// Another（発展コース）の見た目：ログイン画面（?another）・村・レッスン
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const API = 'http://localhost:8791', APP = 'http://localhost:8792/app/index.html', OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  await fetch(API + '/course?v=' + encodeURIComponent('発展'));
  const b = await chromium.launch(); const errs = [];
  for (const [nm, vp] of [['横', { width: 1180, height: 820 }], ['縦', { width: 820, height: 1180 }]]) {
    const c = await b.newContext({ viewport: vp, serviceWorkers: 'block' });
    await c.route('**/app/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.APP_CONFIG={GAS_LOGIN_URL:'${API}/login',GAS_API_URL:'${API}/api',DEADLINE:'2027-01-13'};` }));
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(APP + '?another'); await p.waitForSelector('#login'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    if (nm === '横') console.log('ログイン画面のタイトル:', (await p.textContent('.title')).trim(), '／タブ:', await p.title());
    await p.screenshot({ path: `${OUT}/Another_ログイン_${nm}.png` });
    await p.click('#login'); await p.waitForSelector('#go'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/Another_村_${nm}.png`, fullPage: true });
    if (nm === '横') { await p.click('#go'); await p.waitForSelector('.sentence'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/Another_穴うめ.png` }); }
  }
  // 標準コースに戻すと、ふつうの見た目に戻る
  await fetch(API + '/course?v=');
  const c = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await c.route('**/app/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.APP_CONFIG={GAS_LOGIN_URL:'${API}/login',GAS_API_URL:'${API}/api',DEADLINE:'2027-01-13'};` }));
  const p = await c.newPage(); await p.goto(APP + '?another'); await p.click('#login'); await p.waitForSelector('#go');
  console.log('標準コースの生徒が ?another で開いても、ログイン後は:', (await p.evaluate(() => document.body.classList.contains('another'))) ? 'Another のまま（×）' : 'ふつうの見た目', '／タブ:', await p.title());
  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'なし'); await b.close();
})();
