// コース：名簿の「コース」で単語リストが変わる。変えたら新しいコースのレッスン1から（前の記録は残す）
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const API = 'http://localhost:8791', APP = 'http://localhost:8792/app/index.html';
const W = JSON.parse(fs.readFileSync(path.join(__dirname, 'words-752.json'))), A = JSON.parse(fs.readFileSync(path.join(__dirname, 'words-course-sample.json')));
const issues = []; const ok = (c, m) => { if (!c) issues.push(m); };
(async () => {
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await c.route('**/app/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.APP_CONFIG={GAS_LOGIN_URL:'${API}/login',GAS_API_URL:'${API}/api',DEADLINE:'2027-01-13'};` }));
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const dump = async () => (await fetch(API + '/dump')).json();
  const prog = async () => JSON.parse((await dump())['進捗'][1][1]);
  // ① 標準コースでレッスン1を始める
  await p.goto(APP); await p.click('#login'); await p.waitForSelector('#go');
  console.log('標準：コースの印', (await p.$('.hud .course')) ? 'あり（×）' : 'なし');
  await p.click('#go'); await p.waitForSelector('.sentence');
  let P = await prog(); console.log('標準：レッスン1の最初の語', P.lessons[1].words[0], '／語数', P.lessons[1].words.length);
  ok(P.lessons[1].words[0] === W[0].word && P.lessons[1].words.length === 25, '標準のレッスン1がおかしい');
  // ② 名簿で「発展」にする → 開き直す
  await fetch(API + '/course?v=' + encodeURIComponent('発展'));
  await p.goto(APP); await p.waitForSelector('#go');
  const badge = await p.$('.hud .course'); console.log('発展：コースの印', badge ? (await badge.textContent()) : 'なし'); ok(!!badge, 'コースの印が出ない');
  P = await prog(); console.log('発展：前の記録', (P.prev || []).map((x) => (x.course || '標準') + '・レッスン' + Object.keys(x.data.lessons).join(',')).join(' '), '／いまのレッスン', Object.keys(P.lessons).length);
  ok((P.prev || []).length === 1 && !Object.keys(P.lessons).length, '前の記録が残っていない／レッスンが消えていない');
  await p.screenshot({ path: path.join(__dirname, 'shots', '発展コース_村.png') });
  await p.click('#go'); await p.waitForSelector('.sentence');
  P = await prog(); console.log('発展：レッスン1の最初の語', P.lessons[1].words[0], '／語数', P.lessons[1].words.length);
  ok(P.lessons[1].words[0] === A[0].word && P.lessons[1].words.length === 15, '発展のレッスン1がおかしい');
  const opts = await p.$$eval('.choice', (bs) => bs.map((x) => x.dataset.c)); console.log('発展：穴うめの選択肢', opts.join(' / '));
  ok(opts.every((o) => A.slice(0, 15).some((w) => w.word === o)), '選択肢に発展以外の単語');
  const D = await dump(); console.log('進捗シートのコース列', D['進捗'][0][5], '→', D['進捗'][1][5]); ok(D['進捗'][1][5] === '発展', '進捗シートにコースが出ない');
  console.log('学習ログに courseChange', D['学習ログ'].some((r) => r[3] === 'courseChange') ? 'あり' : 'なし');
  // ③ シートのないコース
  await fetch(API + '/course?v=' + encodeURIComponent('特別'));
  await p.goto(APP); await p.waitForSelector('#retry, #go', { timeout: 8000 });
  console.log('シートがないコース：', (await p.textContent('main')).replace(/\s+/g, ' ').trim().slice(0, 60));
  console.log('ISSUES:', issues.length ? issues.join(' | ') : 'なし'); console.log('ERRORS:', errs.length ? errs.join(' | ') : 'なし');
  await b.close();
})();
