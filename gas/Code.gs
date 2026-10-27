// 英単語アプリ（試作品）と動作確認アプリのサーバー側
// スプレッドシートの「拡張機能 → Apps Script」に貼り付けて使います。
//
// しくみ：
//  ・ログイン用（学校内の全員がアクセスできるデプロイ）
//      学校のアカウントで開くと、その人専用の「通行証」を作り、アプリ（GitHub Pages）に戻す
//  ・受け取り用（全員がアクセスできるデプロイ）
//      アプリから届いた記録を、通行証を確かめてからシートに書き込む
//  通行証は、このスクリプトだけが知っている秘密の鍵で署名するので、生徒が書きかえると無効になる
//
// シート：
//  ・単語   … 英単語・意味・例文（アプリにはログインした人にだけ渡す。GitHub には置かない）
//  ・設定   … 使える人、1日のレッスン上限など
//  ・進捗   … 1人1行。進み具合と単語ごとの記録（JSON）
//  ・学習ログ … 1回の学習ごとの記録（サーバーの時刻付き）

// ▼ アプリを置いた場所（GitHub Pages のURLの先頭）。ここ以外には通行証を渡さない
const ALLOWED_RETURN = 'https://pigfoot533.github.io/vocab-check/';

const TOKEN_DAYS = 60; // 通行証の有効日数
const TZ = 'Asia/Tokyo';

// ---------- ログイン用 ----------
function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  const ret = (e && e.parameter && e.parameter.return) || '';
  const t = HtmlService.createTemplateFromFile('login');
  const allowed = !!email && isAllowed_(email);
  t.email = email;
  t.ok = allowed && ret.indexOf(ALLOWED_RETURN) === 0;
  t.reason = !email ? '学校のGoogleアカウントでログインしてから開いてください。'
    : !allowed ? 'このアカウントは、まだこのアプリを使えません（試作中）。'
    : ret.indexOf(ALLOWED_RETURN) !== 0 ? 'アプリからこのページを開いてください（戻り先が登録されていません）。' : '';
  t.backUrl = t.ok ? ret.split('#')[0] + '#token=' + encodeURIComponent(makeToken_(email)) : '';
  return t.evaluate()
    .setTitle('ログイン')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- 受け取り用 ----------
function doPost(e) {
  const t0 = Date.now();
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '形式が正しくありません' }); }
  const who = verifyToken_(body.token);
  if (!who) return json_({ ok: false, error: '通行証が無効です。もう一度ログインしてください', code: 'auth' });
  if (!isAllowed_(who)) return json_({ ok: false, error: 'このアカウントは、まだこのアプリを使えません（試作中）', code: 'auth' });
  const now = new Date();
  const serverTime = Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm:ss');
  const d = body.data || {};
  try {
    switch (body.action) {
      // --- 動作確認アプリ用 ---
      case 'whoami':
      case 'ping':
        return json_({ ok: true, email: who, serverTime: serverTime, ms: Date.now() - t0 });
      case 'log':
        appendRow_('ログ', ['受信時刻', 'メール', '内容'], [now, who, JSON.stringify(d)]);
        return json_({ ok: true, serverTime: serverTime, ms: Date.now() - t0 });
      case 'result': {
        const r = d.results || {};
        const keys = Object.keys(r);
        appendRow_('結果', ['受信時刻', 'メール', '開き方', '端末'].concat(keys),
          [now, who, d.mode || '', d.ua || ''].concat(keys.map(function (k) { return r[k]; })));
        return json_({ ok: true, serverTime: serverTime, ms: Date.now() - t0 });
      }
      // --- 英単語アプリ（試作品）用 ---
      case 'init':
        return json_(withProgress_(who, function (p) {
          return { ok: true, email: who, serverTime: serverTime, today: today_(), words: loadWords_(), progress: publicProgress_(p), config: publicConfig_() };
        }, false));
      case 'startLesson':
        return json_(withProgress_(who, function (p) { return startLesson_(p, who, Number(d.n)); }, true));
      case 'events':
        return json_(withProgress_(who, function (p) { return applyEvents_(p, who, d.events || []); }, true));
      case 'finishLesson':
        return json_(withProgress_(who, function (p) { return finishLesson_(p, who, Number(d.n), d.summary || {}); }, true));
      case 'reset':
        return json_(withProgress_(who, function (p) {
          Object.keys(p).forEach(function (k) { delete p[k]; });
          Object.assign(p, newProgress_());
          logRows_(who, [{ type: 'reset' }]);
          return { ok: true, progress: publicProgress_(p) };
        }, true));
      default:
        return json_({ ok: false, error: '不明な操作です' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- 英単語アプリ：レッスン ----------
function newProgress_() {
  return { v: 1, lessons: {}, days: {}, stats: {}, studySec: 0, createdAt: Date.now() };
}

function publicProgress_(p) {
  const cfg = config_();
  return {
    lessons: p.lessons, stats: p.stats, studySec: p.studySec || 0,
    todayCount: (p.days || {})[today_()] || 0,
    dailyLimit: cfg.dailyLimit, lessonCount: lessonCount_(cfg),
    days: p.days
  };
}

function publicConfig_() {
  const cfg = config_();
  return { dailyLimit: cfg.dailyLimit, lessonCount: lessonCount_(cfg), reviewMin: cfg.reviewMin, reviewMax: cfg.reviewMax };
}

function lessonCount_(cfg) {
  const n = loadWords_().length;
  return cfg.lessonCount > 0 ? cfg.lessonCount : Math.max(1, Math.ceil(n / cfg.newPerLesson));
}

// レッスン n を始める（新しいレッスンは1日の上限を数える。始めたレッスンの続きは数えない）
function startLesson_(p, who, n) {
  const cfg = config_();
  const total = lessonCount_(cfg);
  if (!(n >= 1 && n <= total)) return { ok: false, error: 'そのレッスンはありません' };
  const L = p.lessons[n];
  if (L) return { ok: true, lesson: L, progress: publicProgress_(p), resumed: true };
  for (let i = 1; i < n; i++) {
    if (!p.lessons[i] || !p.lessons[i].done) return { ok: false, error: 'まだ前のレッスンが終わっていません' };
  }
  const day = today_();
  const used = (p.days[day] || 0);
  if (used >= cfg.dailyLimit) {
    return { ok: false, code: 'limit', error: '今日はもう' + cfg.dailyLimit + 'レッスン始めました。続きは明日！' };
  }
  const words = loadWords_().map(function (w) { return w.word; });
  const order = seededShuffle_(words, hash_(who + '|order'));
  const per = Math.ceil(order.length / total);
  const fresh = order.slice((n - 1) * per, n * per);
  const review = pickReview_(p, n, fresh, cfg);
  const lesson = { n: n, words: fresh, review: review, startedAt: Date.now(), startedDay: day, done: false, steps: {} };
  p.lessons[n] = lesson;
  p.days[day] = used + 1;
  logRows_(who, [{ type: 'startLesson', lesson: n, detail: { words: fresh.length, review: review } }]);
  return { ok: true, lesson: lesson, progress: publicProgress_(p) };
}

// 前のレッスンの単語から、苦手なものほど選ばれやすくして復習の単語を選ぶ
function pickReview_(p, n, fresh, cfg) {
  const pool = [];
  Object.keys(p.lessons).forEach(function (k) {
    if (Number(k) < n) p.lessons[k].words.forEach(function (w) { if (fresh.indexOf(w) < 0 && pool.indexOf(w) < 0) pool.push(w); });
  });
  if (!pool.length) return [];
  const want = Math.min(pool.length, Math.max(cfg.reviewMin, Math.min(cfg.reviewMax, Math.round(pool.length * 0.15))));
  const weighted = pool.map(function (w) { return { w: w, s: weakness_(p.stats[w]) }; });
  const out = [];
  while (out.length < want && weighted.length) {
    const sum = weighted.reduce(function (a, x) { return a + x.s; }, 0);
    let r = Math.random() * sum, i = 0;
    for (; i < weighted.length - 1; i++) { r -= weighted[i].s; if (r <= 0) break; }
    out.push(weighted[i].w);
    weighted.splice(i, 1);
  }
  return out;
}

// 苦手さの点数（大きいほど復習に出やすい）
function weakness_(s) {
  s = s || {};
  return 1 + 2 * (s.qWrong || 0) + 3 * (s.tWrong || 0) + 0.5 * Math.max(0, (s.pronTries || 0) - 2) + 4 * (s.pronSkip || 0) + 1 * (s.wWrong || 0)
    - 0.5 * Math.min(6, s.tRight || 0);
}

// アプリから届いた学習の記録をまとめて反映する
function applyEvents_(p, who, events) {
  const rows = [];
  events.slice(0, 500).forEach(function (ev) {
    const w = ev.word;
    const s = w ? (p.stats[w] = p.stats[w] || {}) : null;
    switch (ev.type) {
      case 'quiz': if (s) { s.seen = (s.seen || 0) + 1; if (!ev.correct) s.qWrong = (s.qWrong || 0) + 1; if (ev.hint) s.hint = (s.hint || 0) + 1; } break;
      case 'pron': if (s) { s.pronTries = (s.pronTries || 0) + (ev.tries || 0); if (ev.skipped) s.pronSkip = (s.pronSkip || 0) + 1; } break;
      case 'write': if (s && ev.letterOk === false) s.wWrong = (s.wWrong || 0) + 1; break;
      case 'test': if (s) { if (ev.correct) s.tRight = (s.tRight || 0) + 1; else s.tWrong = (s.tWrong || 0) + 1; } break;
      case 'step': if (p.lessons[ev.lesson]) p.lessons[ev.lesson].steps[ev.step] = Date.now(); break;
      case 'time': p.studySec = (p.studySec || 0) + Math.max(0, Math.min(600, Number(ev.sec) || 0)); break;
    }
    rows.push(ev);
  });
  logRows_(who, rows);
  return { ok: true, progress: publicProgress_(p) };
}

function finishLesson_(p, who, n, summary) {
  const L = p.lessons[n];
  if (!L) return { ok: false, error: 'そのレッスンは始まっていません' };
  if (!L.done) { L.done = true; L.doneAt = Date.now(); L.doneDay = today_(); }
  L.summary = summary;
  logRows_(who, [{ type: 'finishLesson', lesson: n, detail: summary }]);
  return { ok: true, progress: publicProgress_(p) };
}

// ---------- データの読み書き ----------
function withProgress_(who, fn, write) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet_('進捗', ['メール', '進捗(JSON)', '更新時刻', '完了レッスン数', '学習時間(分)']);
    const emails = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
    let row = emails.indexOf(who) + 2;
    let p = newProgress_();
    if (row >= 2) { try { p = JSON.parse(sh.getRange(row, 2).getValue()) || p; } catch (e) { /* 壊れていたら新しく */ } }
    const res = fn(p);
    if (write) {
      const done = Object.keys(p.lessons || {}).filter(function (k) { return p.lessons[k].done; }).length;
      const vals = [[who, JSON.stringify(p), new Date(), done, Math.round((p.studySec || 0) / 60)]];
      if (row < 2) row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, 5).setValues(vals);
    }
    return res;
  } finally {
    lock.releaseLock();
  }
}

function logRows_(who, events) {
  if (!events.length) return;
  const sh = sheet_('学習ログ', ['受信時刻', 'メール', '端末の時刻', '種類', 'レッスン', '単語', '内容']);
  const now = new Date();
  const rows = events.map(function (ev) {
    const detail = Object.assign({}, ev); ['type', 'lesson', 'word', 'at'].forEach(function (k) { delete detail[k]; });
    return [now, who, ev.at ? new Date(ev.at) : '', ev.type || '', ev.lesson || '', ev.word || '', JSON.stringify(ev.detail || detail)];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

let WORDS_CACHE = null;
function loadWords_() {
  if (WORDS_CACHE) return WORDS_CACHE;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('単語');
  if (!sh || sh.getLastRow() < 2) throw new Error('「単語」シートがありません');
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  WORDS_CACHE = vals.filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    const ex = [];
    for (let i = 0; i < 3; i++) {
      const en = String(r[2 + i * 3] || '').trim();
      if (en) ex.push({ en: en, blank: String(r[3 + i * 3] || '').trim(), ja: String(r[4 + i * 3] || '').trim() });
    }
    return { word: String(r[0]).trim(), meaning: String(r[1]).trim(), ex: ex };
  });
  return WORDS_CACHE;
}

// 「設定」シート（A列：項目、B列：値）
function config_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('設定');
  const m = {};
  if (sh && sh.getLastRow() >= 1) sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(function (r) { m[String(r[0]).trim()] = r[1]; });
  const num = function (k, def) { const v = Number(m[k]); return isFinite(v) && m[k] !== '' && m[k] != null ? v : def; };
  return {
    users: String(m['使える人'] || '').split(/[,\s、]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(String),
    dailyLimit: num('1日のレッスン上限', 3),
    lessonCount: num('レッスン数（0なら自動）', 0),
    newPerLesson: num('1レッスンの新しい単語の数', 17),
    reviewMin: num('復習の単語の数（最小）', 3),
    reviewMax: num('復習の単語の数（最大）', 8)
  };
}

function isAllowed_(email) {
  const users = config_().users;
  return users.indexOf(String(email).toLowerCase()) >= 0;
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

function hash_(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function seededShuffle_(arr, seed) {
  const a = arr.slice();
  let x = seed || 1;
  const rnd = function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// ---------- 部品 ----------
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function appendRow_(name, header, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(name, header);
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SECRET', s); }
  return s;
}

function b64_(bytesOrString) {
  return Utilities.base64EncodeWebSafe(bytesOrString).replace(/=+$/, '');
}

function sign_(payload) {
  return b64_(Utilities.computeHmacSha256Signature(payload, secret_()));
}

function makeToken_(email) {
  const payload = email + '|' + Date.now();
  return b64_(Utilities.newBlob(payload).getBytes()) + '.' + sign_(payload);
}

function verifyToken_(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  let payload;
  try {
    const pad = parts[0] + '==='.slice((parts[0].length + 3) % 4);
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString();
  } catch (e) { return null; }
  if (sign_(payload) !== parts[1]) return null;
  const p = payload.split('|');
  if (Date.now() - Number(p[1]) > TOKEN_DAYS * 86400000) return null;
  return p[0];
}

// 最初に一度だけ手動で実行すると、権限の確認・秘密の鍵・「設定」シートの作成が済む
function setup() {
  secret_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('設定')) {
    const sh = ss.insertSheet('設定');
    const me = Session.getEffectiveUser().getEmail();
    sh.getRange(1, 1, 6, 3).setValues([
      ['使える人', me, '試作中は自分だけ。複数の人はカンマ（,）で区切る'],
      ['1日のレッスン上限', 3, '試すときは一時的に増やしてよい'],
      ['レッスン数（0なら自動）', 0, '0なら「単語の数 ÷ 1レッスンの新しい単語の数」'],
      ['1レッスンの新しい単語の数', 17, ''],
      ['復習の単語の数（最小）', 3, ''],
      ['復習の単語の数（最大）', 8, '']
    ]);
    sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 380);
  }
  Logger.log('準備ができました');
}
