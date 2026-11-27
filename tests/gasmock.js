// 本物の gas/Code.gs を、スプレッドシートの代わり（メモリ上の表）で動かすテスト用サーバー
// 使い方：WORDS=単語のJSON  PROD=1（本番の設定）  PERIOD=使える期間  ME=メール  NAME=名字  node tests/gasmock.js
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), http = require('http'), path = require('path');
const ME = process.env.ME || 'teacher@example.com';
class Range { constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const R = this.sh.d[this.r - 1 + i] || []; row.push(R[this.c - 1 + j] === undefined ? '' : R[this.c - 1 + j]); } o.push(row); } return o; }
  getValue() { return this.getValues()[0][0]; }
  setValue(v) { return this.setValues([[v]]); }
  setValues(v) { for (let i = 0; i < this.nr; i++) { this.sh.d[this.r - 1 + i] = this.sh.d[this.r - 1 + i] || []; for (let j = 0; j < this.nc; j++) this.sh.d[this.r - 1 + i][this.c - 1 + j] = v[i][j]; } return this; } }
class Sheet { constructor(n) { this.n = n; this.d = []; } appendRow(r) { this.d.push(r.slice()); } getLastRow() { return this.d.length; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); } setFrozenRows() {} setColumnWidth() {} deleteRows(s, n) { this.d.splice(s - 1, n); } }
const sheets = {};
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = new Sheet(n)) };
const props = {};
const b2arr = (b) => Array.from(b).map((x) => (x > 127 ? x - 256 : x)), toBuf = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((v) => v & 255)));
const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => ME }), getEffectiveUser: () => ({ getEmail: () => ME }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => (props[k] = v) }) },
  Utilities: { getUuid: () => crypto.randomUUID(), base64EncodeWebSafe: (x) => toBuf(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => b2arr(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), computeHmacSha256Signature: (v, k) => b2arr(crypto.createHmac('sha256', k).update(v).digest()),
    newBlob: (x) => ({ getBytes: () => b2arr(toBuf(x)), getDataAsString: () => toBuf(x).toString('utf8') }),
    formatDate: (d, tz, f) => { const j = new Date(d.getTime() + 9 * 3600000).toISOString(); return f === 'yyyy-MM-dd' ? j.slice(0, 10) : j.slice(0, 19).replace('T', ' '); } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) }, Logger: { log: () => {} }, console, Date, JSON, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8') + ';this.doPost=doPost;this.setup=setup;this.setupProduction=setupProduction;this.makeToken_=makeToken_;this.periodOpen_=periodOpen_;', ctx);
if (process.env.PROD) ctx.setupProduction(); else ctx.setup();
const W = JSON.parse(fs.readFileSync(process.env.WORDS || path.join(__dirname, 'words-sample.json')));
const sh = ss.insertSheet('単語'); sh.appendRow(['英単語', '意味', '例文1', '空欄1', '和訳1', '例文2', '空欄2', '和訳2', '例文3', '空欄3', '和訳3']);
W.forEach((w) => { const r = [w.word, w.meaning]; for (let i = 0; i < 3; i++) { const e = w.ex[i]; r.push(e ? e.en : '', e ? e.blank : '', e ? e.ja : ''); } sh.appendRow(r); });
// コースの単語（例：COURSE=発展 COURSE_WORDS=xxx.json → 「単語_発展」シート）
if (process.env.COURSE && process.env.COURSE_WORDS) {
  const CW = JSON.parse(fs.readFileSync(process.env.COURSE_WORDS)); const cs = ss.insertSheet('単語_' + process.env.COURSE);
  cs.appendRow(['英単語', '意味', '例文1', '空欄1', '和訳1', '例文2', '空欄2', '和訳2', '例文3', '空欄3', '和訳3']);
  CW.forEach((w) => { const r = [w.word, w.meaning]; for (let i = 0; i < 3; i++) { const e = w.ex[i]; r.push(e ? e.en : '', e ? e.blank : '', e ? e.ja : ''); } cs.appendRow(r); });
}
Sheet.prototype.getLastColumn = function () { return Math.max(0, ...this.d.map((r) => r.length)); };
const setCfg = (k, v) => { const row = sheets['設定'].d.find((r) => r[0] === k); if (row) row[1] = v; else sheets['設定'].d.push([k, v]); };
if (process.env.PERIOD !== undefined) setCfg('使える期間', process.env.PERIOD);
if (process.env.ALWAYS !== undefined) setCfg('いつでも使える人', process.env.ALWAYS);
if (process.env.LIMIT) setCfg('1日のレッスン上限', Number(process.env.LIMIT));
if (process.env.NAME) sheets['名簿'].d[1][1] = process.env.NAME;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && u.pathname === '/login') {
    const p = ctx.periodOpen_(ME);
    if (!p.open) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(`<p id="closed">${p.message}</p>`); }
    res.writeHead(302, { Location: u.searchParams.get('return') + '#token=' + encodeURIComponent(ctx.makeToken_(ME)) }); return res.end();
  }
  if (req.method === 'GET' && u.pathname === '/set') { setCfg(u.searchParams.get('k'), u.searchParams.get('v')); res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end('ok'); }
  if (req.method === 'GET' && u.pathname === '/course') { // 名簿の自分の行のコースを変える
    const R = sheets['名簿'].d; if (!R[0][4]) R[0][4] = 'コース'; R[1][4] = u.searchParams.get('v') || ''; res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end('ok'); }
  if (req.method === 'GET' && u.pathname === '/dump') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.d])))); }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const out = ctx.doPost({ postData: { contents: b } }); res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out.s); });
}).listen(Number(process.env.PORT || 8791), () => console.log('gas mock ready'));
