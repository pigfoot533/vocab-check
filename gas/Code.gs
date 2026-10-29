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
          return { ok: true, email: who, name: displayName_(who), serverTime: serverTime, today: today_(), words: loadWords_(), progress: publicProgress_(p), config: publicConfig_() };
        }, false));
      case 'startLesson':
        return json_(withProgress_(who, function (p) { return startLesson_(p, who, Number(d.n)); }, true));
      case 'events':
        return json_(withProgress_(who, function (p) { return applyEvents_(p, who, d.events || []); }, true));
      case 'finishLesson':
        return json_(withProgress_(who, function (p) { return finishLesson_(p, who, Number(d.n), d.summary || {}); }, true));
      case 'popStart':
        return json_(withProgress_(who, function (p) { return popStart_(p, who, !!d.force); }, true));
      case 'popBegin':
        return json_(withProgress_(who, function (p) { const q = popState_(p); if (q.pending && q.pending.id === d.id) q.pending.begun = Date.now(); return { ok: true }; }, true));
      case 'finalBegin':
        return json_(withProgress_(who, function (p) { const f = finalState_(p); if (f.pending && f.pending.id === d.id) f.pending.begun = Date.now(); return { ok: true }; }, true));
      case 'popSubmit':
        return json_(withProgress_(who, function (p) { return popSubmit_(p, who, d.id, d.results || []); }, true));
      case 'popRemedialDone':
        return json_(withProgress_(who, function (p) { return popRemedialDone_(p, who); }, true));
      case 'finalStart':
        return json_(withProgress_(who, function (p) { return finalStart_(p, who); }, true));
      case 'finalSubmit':
        return json_(withProgress_(who, function (p) { return finalSubmit_(p, who, d.id, d.results || []); }, true));
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
    days: p.days,
    pop: publicPop_(p), final: publicFinal_(p)
  };
}

function publicConfig_() {
  const cfg = config_();
  return {
    dailyLimit: cfg.dailyLimit, lessonCount: lessonCount_(cfg), reviewMin: cfg.reviewMin, reviewMax: cfg.reviewMax,
    appName: cfg.appName, subtitle: cfg.subtitle, tryAnytime: cfg.tryAnytime,
    popN: cfg.popN, popPass: cfg.popPass, finalN: cfg.finalN, finalPass: cfg.finalPass, finalWaitMin: cfg.finalWaitMin, finalMax: cfg.finalMax,
    pronBad: cfg.pronBad, pronRatio: cfg.pronRatio, pronPairs: cfg.pronPairs, pronPairLimit: cfg.pronPairLimit, pronInsert: cfg.pronInsert, pronNeed: cfg.pronNeed, pronMatch: cfg.pronMatch, pronLowSignal: cfg.pronLowSignal
  };
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
  // 抜き打ちテスト：やり残し・補習中・今回出す場合は、レッスンの前にテストへ
  const pop = popState_(p);
  if (pop.pending || pop.remedial) return { ok: false, code: 'pop', error: '抜き打ちテストが 待っている！', progress: publicProgress_(p) };
  if (popDue_(p)) { popCreate_(p, who, false); return { ok: false, code: 'pop', error: 'ワードモンスターが あらわれた！', progress: publicProgress_(p) }; }
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
      case 'test': case 'popAns': case 'finalAns': if (s) { if (ev.correct) s.tRight = (s.tRight || 0) + 1; else s.tWrong = (s.tWrong || 0) + 1; } break;
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


// ---------- 冒険者名（名簿シートの名字） ----------
// 「名簿」シート：A列 メール、B列 名字（C列以降は自由：クラス・番号など）。名簿にない人はメールアドレスの前半
function displayName_(email) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('名簿');
  if (sh && sh.getLastRow() >= 2) {
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() === String(email).toLowerCase() && String(rows[i][1]).trim()) return String(rows[i][1]).trim();
    }
  }
  return String(email).split('@')[0];
}

// ---------- 抜き打ちテスト ----------
// 決まり：レッスンを始めるときにランダムで出る。1日に1回まで。前回から3日たったら必ず出す（4日以上あかない）
// 不合格なら、まちがえた単語でレッスンの4ステップ（補習）→ もう一度テスト。合格するまで次のレッスンに進めない
function popState_(p) { return (p.pop = p.pop || { history: [], lastDay: '', pending: null, remedial: null, round: 0 }); }
function publicPop_(p) {
  const q = popState_(p);
  return { pending: q.pending, remedial: q.remedial, lastDay: q.lastDay, history: q.history.slice(-10) };
}
function daysBetween_(a, b) { return Math.round((new Date(b + 'T00:00:00+09:00') - new Date(a + 'T00:00:00+09:00')) / 86400000); }
function doneWords_(p) {
  const set = {};
  Object.keys(p.lessons).forEach(function (k) { const L = p.lessons[k]; if (L.done) L.words.concat(L.review || []).forEach(function (w) { set[w] = 1; }); });
  return Object.keys(set);
}
function popDue_(p) {
  const q = popState_(p), day = today_();
  const done = Object.keys(p.lessons).filter(function (k) { return p.lessons[k].done; });
  if (!done.length || q.lastDay === day) return false;
  const firstDone = done.map(function (k) { return p.lessons[k].doneDay; }).filter(String).sort()[0] || day;
  const since = daysBetween_(q.lastDay || firstDone, day);
  if (since >= 3) return true;           // 3日たったら必ず
  if (since <= 0) return false;
  return Math.random() < 0.35;           // それまではときどき
}
function weightedPick_(p, pool, n) {
  const items = pool.map(function (w) { return { w: w, s: Math.max(0.3, weakness_(p.stats[w])) }; });
  const out = [];
  while (out.length < n && items.length) {
    const sum = items.reduce(function (a, x) { return a + x.s; }, 0);
    let r = Math.random() * sum, i = 0;
    for (; i < items.length - 1; i++) { r -= items[i].s; if (r <= 0) break; }
    out.push(items[i].w); items.splice(i, 1);
  }
  return out;
}
function popCreate_(p, who, forced, keep) {
  const cfg = config_(), q = popState_(p);
  let pool = doneWords_(p);
  if (pool.length < cfg.popN && cfg.tryAnytime) pool = loadWords_().map(function (w) { return w.word; }); // 試作品：範囲が足りなければ全部の単語から
  keep = keep || [];
  const rest = pool.filter(function (w) { return keep.indexOf(w) < 0; });
  const words = keep.slice(0, cfg.popN).concat(weightedPick_(p, rest, Math.max(0, cfg.popN - keep.length)));
  q.round = (keep.length ? q.round : 0) + 1;
  q.pending = { id: Utilities.getUuid(), words: words, round: q.round, forced: !!forced, createdAt: Date.now(), pass: Math.ceil(words.length * cfg.popPass / cfg.popN) };
  logRows_(who, [{ type: 'popCreate', detail: { words: words.length, round: q.round, forced: !!forced } }]);
  return q.pending;
}
function popStart_(p, who, force) {
  const q = popState_(p);
  if (q.remedial) return { ok: true, remedial: q.remedial, progress: publicProgress_(p) };
  if (q.pending && q.pending.begun) { // 途中でやめた → 問題を入れかえて、最初から
    logRows_(who, [{ type: 'popAbandoned', detail: { round: q.pending.round } }]);
    const keep = q.round > 1 && q.lastKeep ? q.lastKeep : [];
    q.round = Math.max(0, q.round - 1);
    return { ok: true, quiz: popCreate_(p, who, q.pending.forced, keep), restarted: true, progress: publicProgress_(p) };
  }
  if (q.pending) return { ok: true, quiz: q.pending, progress: publicProgress_(p) };
  if (!(force && config_().tryAnytime)) return { ok: false, error: 'いまは 抜き打ちテストは ありません' };
  return { ok: true, quiz: popCreate_(p, who, true), progress: publicProgress_(p) };
}
function popSubmit_(p, who, id, results) {
  const q = popState_(p);
  if (!q.pending || q.pending.id !== id) return { ok: false, error: 'このテストは もう終わっています', progress: publicProgress_(p) };
  const right = results.filter(function (r) { return r.ok; }).length;
  const wrong = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.word; });
  const pass = right >= q.pending.pass;
  q.history.push({ day: today_(), at: Date.now(), right: right, n: results.length, pass: pass, round: q.pending.round });
  q.lastDay = today_();
  logRows_(who, [{ type: 'popResult', detail: { right: right, n: results.length, pass: pass, round: q.pending.round, wrong: wrong } }]);
  q.pending = null;
  q.remedial = pass ? null : { words: wrong, round: q.round, createdAt: Date.now() };
  if (pass) { q.round = 0; q.lastKeep = null; }
  return { ok: true, pass: pass, right: right, n: results.length, wrong: wrong, progress: publicProgress_(p) };
}
function popRemedialDone_(p, who) {
  const q = popState_(p);
  if (!q.remedial) return { ok: false, error: '補習は ありません', progress: publicProgress_(p) };
  const keep = q.remedial.words;
  q.remedial = null; q.lastKeep = keep;
  logRows_(who, [{ type: 'popRemedialDone', detail: { words: keep.length } }]);
  return { ok: true, quiz: popCreate_(p, who, false, keep), progress: publicProgress_(p) };
}

// ---------- 最終試験 ----------
// 全部の単語から出題。不合格なら決められた分だけ待って再挑戦（まちがえた単語は残し、正解した単語は入れかえる）。回数に上限あり
function finalState_(p) { return (p.final = p.final || { attempts: [], pending: null, passed: false, lastFailAt: 0, lastWrong: [], lastWords: [] }); }
function publicFinal_(p) {
  const f = finalState_(p), cfg = config_();
  return { pending: f.pending, passed: f.passed, tries: f.attempts.length, max: cfg.finalMax, lastFailAt: f.lastFailAt, waitMs: cfg.finalWaitMin * 60000, attempts: f.attempts.slice(-5) };
}
function finalStart_(p, who) {
  const f = finalState_(p), cfg = config_();
  const total = lessonCount_(cfg);
  const allDone = Object.keys(p.lessons).filter(function (k) { return p.lessons[k].done; }).length >= total;
  if (!allDone && !cfg.tryAnytime) return { ok: false, code: 'final-locked', error: 'すべての レッスンを 攻略すると 挑戦できます' };
  if (f.passed) return { ok: false, code: 'final-passed', error: '最終試験は もう合格しています', progress: publicProgress_(p) };
  if (f.pending && f.pending.begun) { // 途中でやめた → 不合格1回として数える
    f.attempts.push({ at: Date.now(), day: today_(), right: 0, n: f.pending.words.length, pass: false, abandoned: true });
    f.lastWords = f.pending.words; f.lastWrong = f.pending.words.slice(0, Math.ceil(f.pending.words.length / 2));
    f.lastFailAt = f.pending.begun; f.pending = null;
    logRows_(who, [{ type: 'finalAbandoned', detail: { attempt: f.attempts.length } }]);
  }
  if (f.pending) return { ok: true, exam: f.pending, progress: publicProgress_(p) };
  if (f.attempts.length >= cfg.finalMax) return { ok: false, code: 'final-max', error: '挑戦できる回数（' + cfg.finalMax + '回）を 使い切りました。冬休み明けに 居残りで 再挑戦です。', progress: publicProgress_(p) };
  const wait = f.lastFailAt + cfg.finalWaitMin * 60000 - Date.now();
  if (wait > 0) return { ok: false, code: 'final-wait', waitMs: wait, error: 'あと ' + Math.ceil(wait / 60000) + '分で 再挑戦できます', progress: publicProgress_(p) };
  const all = loadWords_().map(function (w) { return w.word; });
  const keep = f.lastWrong.slice(0, cfg.finalN);
  const fresh = all.filter(function (w) { return keep.indexOf(w) < 0 && f.lastWords.indexOf(w) < 0; });
  let words = keep.concat(weightedPick_(p, fresh, cfg.finalN - keep.length));
  if (words.length < cfg.finalN) words = words.concat(weightedPick_(p, all.filter(function (w) { return words.indexOf(w) < 0; }), cfg.finalN - words.length));
  const n = words.length;
  f.pending = { id: Utilities.getUuid(), words: words, attempt: f.attempts.length + 1, createdAt: Date.now(), pass: Math.ceil(n * cfg.finalPass / cfg.finalN) };
  logRows_(who, [{ type: 'finalCreate', detail: { words: n, attempt: f.pending.attempt, kept: keep.length } }]);
  return { ok: true, exam: f.pending, progress: publicProgress_(p) };
}
function finalSubmit_(p, who, id, results) {
  const f = finalState_(p), cfg = config_();
  if (!f.pending || f.pending.id !== id) return { ok: false, error: 'この試験は もう終わっています', progress: publicProgress_(p) };
  const right = results.filter(function (r) { return r.ok; }).length;
  const wrong = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.word; });
  const pass = right >= f.pending.pass;
  f.attempts.push({ at: Date.now(), day: today_(), right: right, n: results.length, pass: pass });
  f.lastWords = f.pending.words; f.lastWrong = wrong;
  if (pass) { f.passed = true; f.passedAt = Date.now(); } else f.lastFailAt = Date.now();
  logRows_(who, [{ type: 'finalResult', detail: { right: right, n: results.length, pass: pass, attempt: f.pending.attempt, wrong: wrong } }]);
  f.pending = null;
  return { ok: true, pass: pass, right: right, n: results.length, wrongMeanings: wrong.length, left: Math.max(0, cfg.finalMax - f.attempts.length), progress: publicProgress_(p) };
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
  const bool = function (k, def) { const v = m[k]; if (v === '' || v == null) return def; return v === true || /^(true|はい|yes|1|○|on)$/i.test(String(v).trim()); };
  return {
    users: String(m['使える人'] || '').split(/[,\s、]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(String),
    dailyLimit: num('1日のレッスン上限', 3),
    lessonCount: num('レッスン数（0なら自動）', 0),
    newPerLesson: num('1レッスンの新しい単語の数', 17),
    reviewMin: num('復習の単語の数（最小）', 3),
    reviewMax: num('復習の単語の数（最大）', 8),
    appName: String(m['アプリの名前'] || '単語の冒険').trim(),
    subtitle: String(m['サブタイトル'] || '〜 忘却の魔王から ことばの王国を救え 〜').trim(),
    tryAnytime: bool('抜き打ち・最終試験をいつでも受けられる（試作品用）', true),
    popN: num('抜き打ちテストの問題数', 15),
    popPass: num('抜き打ちテストの合格点', 11),
    finalN: num('最終試験の問題数', 30),
    finalPass: num('最終試験の合格点', 22),
    finalWaitMin: num('最終試験の再挑戦まで（分）', 10),
    finalMax: num('最終試験の回数の上限', 5),
    pronBad: num('発音：はっきり違う音とみなす点（小さいほど甘い）', -7),
    pronRatio: num('発音：はっきり違う音の割合の上限（0〜1）', 0.4),
    pronMatch: num('発音：聞き取れた音と正しい音の一致率の下限（0〜1）', 0.5),
    pronLowSignal: bool('発音：AIがほとんど聞き取れないときは不合格', true),
    pronPairs: bool('発音：rとl・bとvを見分ける', true),
    pronPairLimit: num('発音：rとl・bとvの厳しさ（小さいほど甘い）', -3.5),
    pronInsert: bool('発音：余分な母音を不合格にする', false),
    pronNeed: num('発音：合格に必要な回数', 1)
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
  const sh = ss.getSheetByName('設定') || ss.insertSheet('設定');
  const me = Session.getEffectiveUser().getEmail();
  const rows = [
    ['使える人', me, '試作中は自分だけ。複数の人はカンマ（,）で区切る'],
    ['1日のレッスン上限', 3, '試すときは一時的に増やしてよい'],
    ['レッスン数（0なら自動）', 0, '0なら「単語の数 ÷ 1レッスンの新しい単語の数」'],
    ['1レッスンの新しい単語の数', 17, ''],
    ['復習の単語の数（最小）', 3, ''],
    ['復習の単語の数（最大）', 8, ''],
    ['アプリの名前', '単語の冒険', 'ログイン画面などに表示する名前'],
    ['サブタイトル', '〜 忘却の魔王から ことばの王国を救え 〜', 'ログイン画面の名前の下に表示'],
    ['抜き打ち・最終試験をいつでも受けられる（試作品用）', 'はい', '本番では必ず「いいえ」にする'],
    ['抜き打ちテストの問題数', 15, ''],
    ['抜き打ちテストの合格点', 11, ''],
    ['最終試験の問題数', 30, ''],
    ['最終試験の合格点', 22, ''],
    ['最終試験の再挑戦まで（分）', 10, ''],
    ['最終試験の回数の上限', 5, ''],
    ['発音：はっきり違う音とみなす点（小さいほど甘い）', -7, '例：-8にすると甘く、-6にすると厳しく'],
    ['発音：はっきり違う音の割合の上限（0〜1）', 0.4, '0.4なら、単語の音の4割まで違っても合格'],
    ['発音：聞き取れた音と正しい音の一致率の下限（0〜1）', 0.5, 'AIが聞き取った音と正しい音が、この割合以上そろえば合格。上げると厳しく'],
    ['発音：AIがほとんど聞き取れないときは不合格', 'はい', 'ぼそぼそ言ったり、別のことばを言ったりしたとき'],
    ['発音：rとl・bとvを見分ける', 'はい', '「いいえ」にすると見分けない'],
    ['発音：rとl・bとvの厳しさ（小さいほど甘い）', -3.5, ''],
    ['発音：余分な母音を不合格にする', 'いいえ', '「はい」にすると、「ク」のような余分な母音で不合格'],
    ['発音：合格に必要な回数', 1, '1単語につき、この回数だけ合格したら次の単語へ']
  ];
  const have = sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  rows.forEach(function (r) { if (have.indexOf(r[0]) < 0) sh.appendRow(r); }); // まだない項目だけ追加（今の値は変えない）
  sh.setColumnWidth(1, 300); sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 380);
  if (!ss.getSheetByName('名簿')) {
    const r = ss.insertSheet('名簿');
    r.getRange(1, 1, 2, 4).setValues([['メール', '名字（アプリに表示）', 'クラス', '番号'], [me, '', '', '']]);
    r.setFrozenRows(1); r.setColumnWidth(1, 300); r.setColumnWidth(2, 180);
  }
  Logger.log('準備ができました');
}
