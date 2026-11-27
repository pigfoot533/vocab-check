// 本番の設定で：使える期間の前の画面、発音AIの事前ダウンロード、リスト順の30レッスン、書く練習2回、リセットボタンなし
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const W = JSON.parse(fs.readFileSync(process.env.WORDS || path.join(__dirname, 'words-752.json')));
const API = 'http://localhost:8791', APP = 'http://localhost:8792/app/index.html';
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a); const issues = [];
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctxOpt = { permissions: ['microphone'], viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' };
  const cfgBody = `window.APP_CONFIG={GAS_LOGIN_URL:'${API}/login',GAS_API_URL:'${API}/api',DEADLINE:'2027-01-13'};`;
  // ① ふつうの端末（発音AIはまだない）
  const c1 = await b.newContext(ctxOpt); await c1.route('**/app/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: cfgBody }));
  const p = await c1.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(APP); await p.click('#login'); await p.waitForSelector('#go');
  await p.waitForSelector('.aiprep #dl', { timeout: 5000 }).then(() => log('村に「発音AIを準備しよう」が出る: はい')).catch(() => issues.push('村に発音AIの準備が出ない'));
  await p.screenshot({ path: OUT + '/村_AI準備.png' });
  await p.click('#toSet'); await p.waitForSelector('#logout');
  log('設定にリセットボタン:', (await p.$('#reset')) ? 'ある（×）' : 'ない'); if (await p.$('#reset')) issues.push('本番なのにリセットボタンがある');
  log('設定に発音AIの準備:', (await p.$('.aiprep #dl')) ? 'ある' : 'ない');
  // ② 使える期間の外にする → 開き直すと「〜から使えます」と、発音AIの準備
  await fetch(API + '/set?k=' + encodeURIComponent('使える期間') + '&v=' + encodeURIComponent('2099-12-21〜2099-12-31'));
  await p.goto(APP); await p.waitForSelector('#go', { timeout: 8000 }); log('期間外でも「いつでも使える人」（先生）は使える: はい');
  await fetch(API + '/set?k=' + encodeURIComponent('いつでも使える人') + '&v=');
  await p.goto(APP); await p.waitForSelector('#retry', { timeout: 8000 }); await p.waitForSelector('.aiprep #dl', { timeout: 5000 }).catch(() => {});
  log('期間外の画面:', (await p.textContent('.loading .parch p:nth-child(2)')).trim(), '／発音AIの準備:', (await p.$('.aiprep #dl')) ? 'ある' : 'ない');
  await p.screenshot({ path: OUT + '/期間外.png' });
  await fetch(API + '/set?k=' + encodeURIComponent('使える期間') + '&v=');
  // ③ レッスン（発音AIはあることにする）
  const c2 = await b.newContext(ctxOpt); await c2.route('**/app/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: cfgBody }));
  await c2.route('**/app/js/voice.js', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../app/js/voice.js'), 'utf8')
    .replace('async function judge(blob, word, mode, onProgress) {', 'async function judge(blob, word, mode, onProgress) { return { pass: true, decision:{pass:true,reasons:[]}, advice:"", html: "" };')
    .replace('async function modelReady() {', 'async function modelReady() { return true;').replace('function speak(text, rate = 0.9) {', 'function speak(text, rate = 0.9) { return Promise.resolve(true);')
    .replace(/async function listen\(\{ maxMs = 3500,/, 'async function listen({ maxMs = 600,') }));
  const q = await c2.newPage(); q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(APP); await q.click('#login'); await q.waitForSelector('#go'); await q.click('#go');
  await q.waitForSelector('.sentence', { timeout: 15000 });
  const dump = await (await fetch(API + '/dump')).json();
  const prog = JSON.parse(dump['進捗'][1][1]); const L1 = prog.lessons[1];
  const want = W.slice(0, 25).map((w) => w.word);
  log('レッスン1の単語数:', L1.words.length, '／リストの最初の25語と同じ:', JSON.stringify(L1.words) === JSON.stringify(want), '／復習の単語:', L1.review.length);
  if (JSON.stringify(L1.words) !== JSON.stringify(want)) issues.push('レッスン1がリスト順でない');
  if (L1.review.length) issues.push('復習の単語が入っている');
  log('レッスン数:', JSON.parse(JSON.stringify(dump['設定'])).find((r) => r[0] === 'レッスン数（0なら自動）')[1], '／1日の上限:', dump['設定'].find((r) => r[0] === '1日のレッスン上限')[1]);
  // 穴うめ（正解を選ぶ）
  const by = {}; W.forEach((w) => (by[w.word] = w));
  for (let n = 0; n < 40; n++) {
    await q.waitForSelector('.sentence, #nx', { timeout: 15000 }); if (await q.$('#nx')) break;
    const sen = (await q.textContent('.sentence')).replace(/\s+/g, ' ').trim();
    const cands = await q.$$eval('.choice', (bs) => bs.map((x) => x.dataset.c));
    const ans = cands.find((w) => by[w].ex.some((e) => sen.includes(e.en.replace(new RegExp('\\b' + e.blank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '').replace(/\s+/g, ' ').trim().split(' ').slice(-2).join(' ')))) || cands[0];
    await q.click(`.choice[data-c="${ans}"]`); await q.waitForSelector('#nextBtn, #ok', { timeout: 8000 });
    if (await q.$('#nextBtn')) await q.click('#nextBtn'); else { await q.waitForSelector('#ok:not([disabled])', { timeout: 8000 }); await q.click('#ok'); }
  }
  await q.click('#nx'); await q.waitForSelector('#nx', { state: 'detached' });
  // 発音（合格にしてある）
  for (let n = 0; n < 30; n++) { await q.waitForSelector('#say, #nx', { timeout: 15000 }); if (await q.$('#nx')) break; await q.click('#say'); await q.waitForSelector('#nextBtn', { timeout: 15000 }); await q.click('#nextBtn'); }
  await q.click('#nx'); await q.waitForSelector('#nx', { state: 'detached' });
  // 書く練習：回数の表示
  await q.waitForSelector('.reps'); const reps = await q.$$eval('.reps span', (s) => s.length);
  log('書く練習の回数:', reps, '／1回目のお手本:', (await q.$('.word.model')) ? 'あり' : 'なし');
  if (reps !== 2) issues.push('書く練習が2回でない');
  await q.screenshot({ path: OUT + '/書く練習.png' });
  log('ISSUES:', issues.length ? issues.join(' | ') : 'なし'); log('ERRORS:', errs.length ? errs.join(' | ') : 'なし');
  await b.close();
})();
