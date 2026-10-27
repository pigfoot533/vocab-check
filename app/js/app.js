// 英単語アプリ（試作品）：画面とレッスンの流れ
const App = (() => {
  const CFG = window.APP_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => U.esc(s);
  const main = () => $('#main');
  const S = { email: '', words: {}, list: [], progress: null, config: null, today: '' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  const CHEER = {
    home: ['今日も一歩ずつ進もう！', 'コツコツ続ける人が、最後に勝つ！', '昨日の自分より、1語多く覚えよう。', 'きみの冒険は、まだ始まったばかり！', '声に出した単語は、忘れにくい！'],
    right: ['正解！', 'いいね！', 'その調子！', 'ナイス！', 'さすが！'],
    wrong: ['おしい！', 'ここで覚えれば大丈夫！', '間違えた単語ほど、伸びしろ！'],
    stepDone: ['ステップクリア！', 'よくがんばった！', 'あと少し！'],
  };

  // ---------- 起動 ----------
  async function start() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!API.loggedIn()) return showLogin();
    showLoading('データを読み込んでいます…');
    try {
      const j = await API.call('init');
      if (!j.ok) { if (!API.loggedIn()) return showLogin(j.error); return showError(j.error); }
      S.email = j.email; S.today = j.today; S.config = j.config; S.progress = j.progress;
      S.list = j.words; S.words = {}; j.words.forEach((w) => { S.words[w.word] = w; });
      API.flush();
      const st = loadState();
      if (st && S.progress.lessons[st.n] && !S.progress.lessons[st.n].done) return showHome(true);
      showHome();
    } catch (e) { showError(e.message); }
  }
  function onProgress(p) { if (p) S.progress = p; }

  // ---------- 共通の画面 ----------
  function header(title, back) {
    return `<header class="top"><div class="top-l">${back ? '<button class="ghost" id="back">← マップ</button>' : '<span class="logo">🗺️ 単語の冒険</span>'}</div><div class="top-c">${esc(title || '')}</div><div class="top-r">${back ? '' : '<button class="ghost" id="gear" aria-label="設定">⚙️</button>'}</div></header>`;
  }
  function bindHeader() {
    const b = $('#back'); if (b) b.onclick = () => { if (confirm('マップに戻りますか？（このステップは最初からになります）')) { stopAll(); showHome(); } };
    const g = $('#gear'); if (g) g.onclick = showSettings;
  }
  function showLoading(msg) { main().innerHTML = `<div class="center"><div class="spinner"></div><p>${esc(msg)}</p></div>`; }
  function showError(msg) {
    main().innerHTML = `<div class="center card"><p class="big">😢</p><p>${esc(msg)}</p><button class="btn primary" id="retry">もう一度ためす</button></div>`;
    $('#retry').onclick = start;
  }
  function showLogin(msg) {
    main().innerHTML = `<div class="center card login">
      <p class="big">🗺️</p><h1>単語の冒険</h1>
      <p>学校のGoogleアカウントでログインしてください。</p>
      ${msg ? `<p class="notice warn">${esc(msg)}</p>` : ''}
      <button class="btn primary big-btn" id="login">ログインする</button>
      <p class="small muted">試作品：先生のアカウントだけが使えます。</p></div>`;
    $('#login').onclick = API.login;
  }

  // ---------- ホーム（冒険マップ） ----------
  function streak() {
    const days = Object.keys((S.progress && S.progress.days) || {}).sort();
    if (!days.length) return 0;
    const set = new Set(days);
    let d = new Date(S.today + 'T00:00:00+09:00'), n = 0;
    if (!set.has(fmtDay(d))) d = new Date(d.getTime() - 86400000);
    while (set.has(fmtDay(d))) { n++; d = new Date(d.getTime() - 86400000); }
    return n;
  }
  function fmtDay(d) { return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
  function lessonStatus(n) {
    const L = S.progress.lessons[n];
    if (L && L.done) return 'done';
    for (let i = 1; i < n; i++) { const P = S.progress.lessons[i]; if (!P || !P.done) return 'locked'; }
    return L ? 'doing' : 'next';
  }
  function showHome() {
    stopAll();
    const P = S.progress, total = P.lessonCount;
    const done = Object.keys(P.lessons).filter((k) => P.lessons[k].done).length;
    let cur = 0; for (let n = 1; n <= total; n++) { const s = lessonStatus(n); if (s === 'next' || s === 'doing') { cur = n; break; } }
    const pct = Math.round(done / total * 100);
    const left = total - done;
    const deadline = new Date((CFG.DEADLINE || '2027-01-12') + 'T23:59:59+09:00');
    const daysLeft = Math.max(0, Math.ceil((deadline - new Date(S.today + 'T00:00:00+09:00')) / 86400000));
    const needPerDay = daysLeft ? Math.ceil(left / daysLeft * 10) / 10 : left;
    const pace = !left ? '全レッスンクリア！ 最終試験に向けて復習しよう。'
      : needPerDay > P.dailyLimit ? `⚠️ このままだと締切に間に合いません。今日から毎日 ${P.dailyLimit} レッスンやろう！`
      : `締切まであと ${daysLeft} 日。1日 ${needPerDay} レッスンのペースで間に合います。`;
    const todayLeft = Math.max(0, P.dailyLimit - P.todayCount);
    const curStatus = cur ? lessonStatus(cur) : null;
    const canStart = cur && (curStatus === 'doing' || todayLeft > 0);
    main().innerHTML = header('') + `
      <section class="hero card">
        <p class="cheer">${esc(pick(CHEER.home))}</p>
        <div class="chips">
          <div class="chip"><b>${P.todayCount}/${P.dailyLimit}</b><span>今日のレッスン</span></div>
          <div class="chip"><b>${done}/${total}</b><span>クリア</span></div>
          <div class="chip"><b>🔥 ${streak()}</b><span>連続日数</span></div>
          <div class="chip"><b>${Math.round((P.studySec || 0) / 60)}分</b><span>学習時間</span></div>
        </div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        <p class="small">${esc(pace)}</p>
        ${cur ? `<button class="btn primary big-btn" id="go" ${canStart ? '' : 'disabled'}>${curStatus === 'doing' ? `レッスン ${cur} のつづきから` : `レッスン ${cur} をはじめる`}</button>
          ${canStart ? '' : '<p class="small muted center-t">今日のレッスンはここまで。明日また冒険しよう！</p>'}` : ''}
      </section>
      <section class="map card"><h2>冒険マップ</h2>${mapSvg(total, cur)}</section>
      ${API.pending() ? `<p class="small muted center-t">送信待ちの記録：${API.pending()}件（電波のよい場所で自動で送ります）</p>` : ''}`;
    bindHeader();
    const go = $('#go'); if (go) go.onclick = () => openLesson(cur);
    main().querySelectorAll('[data-lesson]').forEach((g) => g.addEventListener('click', () => {
      const n = Number(g.dataset.lesson), s = lessonStatus(n);
      if (s === 'done') U.toast(`レッスン ${n} はクリア済み！（2周目の機能は準備中）`);
      else if (s === 'locked') U.toast('前のレッスンをクリアすると進めます');
      else if (canStart) openLesson(n);
    }));
  }
  function mapSvg(total, cur) {
    const W = 340, rowH = 84, H = rowH * (total + 1) + 40;
    const pts = [];
    for (let i = 0; i <= total; i++) { const x = [70, 170, 270, 170][i % 4]; pts.push([x, H - 50 - i * rowH]); }
    let path = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; path += ` C${x0},${y0 - rowH / 2} ${x1},${y1 + rowH / 2} ${x1},${y1}`; }
    let nodes = '';
    for (let n = 1; n <= total; n++) {
      const [x, y] = pts[n - 1], s = lessonStatus(n);
      const fill = s === 'done' ? 'var(--gold)' : s === 'locked' ? 'var(--locked)' : 'var(--accent)';
      const label = s === 'done' ? '★' : s === 'locked' ? '🔒' : String(n);
      nodes += `<g class="node ${s}${n === cur ? ' cur' : ''}" data-lesson="${n}" role="button">
        ${n === cur ? `<circle cx="${x}" cy="${y}" r="34" class="pulse"/>` : ''}
        <circle cx="${x}" cy="${y}" r="26" fill="${fill}" stroke="#fff" stroke-width="4"/>
        <text x="${x}" y="${y + 7}" text-anchor="middle" class="nlabel">${label}</text>
        <text x="${x}" y="${y + 46}" text-anchor="middle" class="ncap">レッスン${n}</text></g>`;
    }
    const [fx, fy] = pts[total];
    nodes += `<g class="node goal"><text x="${fx}" y="${fy + 12}" text-anchor="middle" class="castle">🏰</text><text x="${fx}" y="${fy + 46}" text-anchor="middle" class="ncap">最終試験（準備中）</text></g>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="mapsvg"><path d="${path}" class="road"/>${nodes}</svg>`;
  }

  // ---------- 設定 ----------
  async function showSettings() {
    const cached = await Voice.modelReady();
    main().innerHTML = header('設定', false).replace('<span class="logo">🗺️ 単語の冒険</span>', '<button class="ghost" id="home">← マップ</button>') + `
      <section class="card"><h2>アカウント</h2><p>${esc(S.email)}</p><button class="btn" id="logout">ログアウト</button></section>
      <section class="card"><h2>発音判定のAI</h2><p>${cached ? '✅ この端末に保存済み' : '未保存（発音ステップの前にダウンロードします）'}</p></section>
      <section class="card"><h2>手書きの学習データ</h2><p>この端末で覚えた、あなたの字の手本：${HW.personalCount()}文字分</p>
        <button class="btn" id="forget">手書きの学習データを消す</button></section>
      <section class="card"><h2>試作品用</h2><p class="small">進み具合をすべて消して、レッスン1からやり直します。</p>
        <button class="btn danger" id="reset">進み具合をリセット</button></section>
      <section class="card small muted"><h2>このアプリについて</h2>
        <p>発音判定：HuBERT 音素認識モデル（ron-jo/hubert-base-phoneme-en-onnx・Apache-2.0）、ONNX Runtime Web（MIT）、CMU Pronouncing Dictionary（BSD）、Moby Hyphenator II（パブリックドメイン）。</p>
        <p>AIの判定は目安です。先生のお手本や辞書の音声も聞きましょう。手書きの読み取りも、丁寧に書かないと正しく読めないことがあります。</p>
        <p>録音した声は、この端末の中だけで処理し、どこにも送りません。</p></section>`;
    $('#home').onclick = showHome;
    $('#gear') && ($('#gear').style.display = 'none');
    $('#logout').onclick = () => { API.logout(); showLogin(); };
    $('#forget').onclick = () => { if (confirm('手書きの学習データを消しますか？')) { HW.forget(); showSettings(); } };
    $('#reset').onclick = async () => {
      if (!confirm('本当に進み具合をリセットしますか？（試作品用）')) return;
      showLoading('リセットしています…');
      try { const j = await API.call('reset'); if (j.ok) { S.progress = j.progress; clearState(); } showHome(); } catch (e) { showError(e.message); }
    };
  }

  // ---------- レッスンの状態（端末に保存して、途中から再開できるように） ----------
  const SKEY = 'app-lesson-state';
  function loadState() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { return null; } }
  function saveState(st) { try { localStorage.setItem(SKEY, JSON.stringify(st)); } catch { /* なし */ } }
  function clearState() { try { localStorage.removeItem(SKEY); } catch { /* なし */ } }

  // 学習時間（画面を見ている間だけ数える）
  let timeTimer = null, activeSince = 0, lessonNo = 0;
  function startClock(n) {
    lessonNo = n; activeSince = document.hidden ? 0 : Date.now();
    clearInterval(timeTimer);
    timeTimer = setInterval(() => { tickClock(); }, 60000);
  }
  function tickClock() {
    if (activeSince) { const sec = Math.round((Date.now() - activeSince) / 1000); if (sec > 0) API.record({ type: 'time', lesson: lessonNo, sec }); activeSince = document.hidden ? 0 : Date.now(); }
  }
  document.addEventListener('visibilitychange', () => {
    if (!timeTimer) return;
    if (document.hidden) tickClock(); else activeSince = Date.now();
  });
  let cleanups = [];
  function stopAll() {
    if (timeTimer) { tickClock(); clearInterval(timeTimer); timeTimer = null; }
    cleanups.forEach((f) => { try { f(); } catch { /* なし */ } }); cleanups = [];
    try { speechSynthesis.cancel(); } catch { /* なし */ }
  }

  // ---------- レッスン ----------
  async function openLesson(n) {
    showLoading('レッスンを準備しています…');
    let j;
    try { j = await API.call('startLesson', { n }); } catch (e) { return showError(e.message); }
    if (!j.ok) { U.toast(j.error); S.progress = j.progress || S.progress; return showHome(); }
    S.progress = j.progress;
    const L = j.lesson;
    const words = L.words.concat(L.review || []).filter((w) => S.words[w]);
    let st = loadState();
    if (!st || st.n !== n) { st = { n, step: 1 }; saveState(st); }
    startClock(n);
    runStep(L, words, st);
  }
  async function runStep(L, words, st) {
    stopAll(); startClock(L.n);
    const steps = { 1: stepQuiz, 2: stepPron, 3: stepWrite, 4: stepTest };
    if (st.step > 4) return finishLesson(L, words, st);
    await steps[st.step](L, words, st, async () => {
      API.record({ type: 'step', lesson: L.n, step: st.step });
      API.flush();
      st.step++; delete st.sub; saveState(st);
      if (st.step <= 4) await stepBreak(st.step - 1);
      runStep(L, words, st);
    });
  }
  function stepBar(cur) {
    const names = ['穴うめ', '発音', '書く練習', '書きテスト'];
    return `<ol class="steps">${names.map((nm, i) => `<li class="${i + 1 < cur ? 'done' : i + 1 === cur ? 'cur' : ''}">${i + 1}. ${nm}</li>`).join('')}</ol>`;
  }
  function stepBreak(done) {
    return new Promise((res) => {
      main().innerHTML = `<div class="center card celebrate"><p class="big">🎉</p><h2>${esc(pick(CHEER.stepDone))}</h2><p>ステップ${done}が終わりました。</p><button class="btn primary big-btn" id="nx">つぎのステップへ</button></div>`;
      $('#nx').onclick = res;
    });
  }
  function lessonHeader(L, step, extra = '') {
    return header(`レッスン ${L.n}`, true) + stepBar(step) + extra;
  }
  function bar(i, n) { return `<div class="progress thin"><div style="width:${Math.round(i / n * 100)}%"></div></div><p class="small muted right-t">${i}/${n}</p>`; }

  // ===== ステップ1：穴うめ =====
  function blankHtml(ex) {
    const re = new RegExp(`\\b${ex.blank}\\b`);
    return esc(ex.en).replace(re, '<span class="blank">　　　　</span>');
  }
  function fullHtml(ex) {
    const re = new RegExp(`\\b${ex.blank}\\b`);
    return esc(ex.en).replace(re, `<b class="hl">${esc(ex.blank)}</b>`);
  }
  function chooseEx(w) {
    const exs = S.words[w].ex.filter((e) => e.blank);
    const seen = (S.progress.stats[w] && S.progress.stats[w].seen) || 0;
    return exs[seen % exs.length];
  }
  function stepQuiz(L, words, st, next) {
    let queue = shuffle(words).map((w) => ({ w, ex: chooseEx(w), tries: 0 }));
    const total = queue.length; let doneN = 0;
    const show = () => {
      if (!queue.length) return next();
      const q = queue[0];
      const others = shuffle(words.filter((x) => x !== q.w)).slice(0, 3);
      const choices = shuffle([q.w].concat(others));
      const t0 = Date.now(); let hintUsed = false, answered = false;
      main().innerHTML = lessonHeader(L, 1, bar(doneN, total)) + `
        <section class="card q">
          <p class="small muted">空らんに入る、いちばん合う単語を選ぼう</p>
          <p class="sentence">${blankHtml(q.ex)}</p>
          <div class="hint" id="hint"><button class="btn small" id="hintBtn" disabled>💡 ヒント（<span id="hs">15</span>秒後）</button></div>
          <div class="choices">${choices.map((c) => `<button class="choice" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
          <div id="fb"></div>
        </section>`;
      bindHeader();
      let left = 15;
      const timer = setInterval(() => {
        left--; const hs = $('#hs'); if (hs) hs.textContent = left;
        if (left <= 0) { clearInterval(timer); const hb = $('#hintBtn'); if (hb) { hb.disabled = false; hb.textContent = '💡 ヒントを見る（和訳）'; } }
      }, 1000);
      cleanups.push(() => clearInterval(timer));
      $('#hintBtn').onclick = () => { hintUsed = true; $('#hint').innerHTML = `<p class="ja">💡 ${esc(q.ex.ja)}</p>`; };
      main().querySelectorAll('.choice').forEach((b) => b.onclick = async () => {
        if (answered) return; answered = true; clearInterval(timer);
        const ok = b.dataset.c === q.w;
        API.record({ type: 'quiz', lesson: L.n, word: q.w, correct: ok, hint: hintUsed, ms: Date.now() - t0, try: q.tries + 1 });
        main().querySelectorAll('.choice').forEach((x) => { x.disabled = true; if (x.dataset.c === q.w) x.classList.add('right'); });
        if (ok) {
          b.classList.add('right');
          $('#fb').innerHTML = `<p class="fb ok">⭕ ${esc(pick(CHEER.right))}</p><p class="sentence small">${fullHtml(q.ex)}</p><p class="ja small">${esc(q.ex.ja.replace('（　　）', `（${S.words[q.w].meaning}）`))}</p>`;
          queue.shift(); doneN++;
          await sleep(1400);
        } else {
          b.classList.add('wrong');
          $('#fb').innerHTML = `<p class="fb ng">❌ ${esc(pick(CHEER.wrong))} 正解は <b>${esc(q.w)}</b>（${esc(S.words[q.w].meaning)}）</p><p class="sentence small">${fullHtml(q.ex)}</p><p class="ja small">${esc(q.ex.ja.replace('（　　）', `（${S.words[q.w].meaning}）`))}</p><p class="small muted">この問題は、あとでもう一度出ます。</p><button class="btn primary" id="ok" disabled>3</button>`;
          q.tries++; queue.push(queue.shift());
          const okb = $('#ok');
          for (let s = 3; s > 0; s--) { okb.textContent = String(s); await sleep(1000); }
          okb.disabled = false; okb.textContent = 'つぎへ';
          await new Promise((r) => { okb.onclick = r; });
        }
        show();
      });
    };
    show();
  }

  // ===== 判定用AIの準備（初回だけ） =====
  async function ensureModel(L, step) {
    if (await Voice.modelReady()) return true;
    return new Promise((resolve) => {
      main().innerHTML = lessonHeader(L, step) + `<section class="card center">
        <p class="big">🎙️</p><h2>発音判定のAIを準備します</h2>
        <p>初回だけ、約116MBをダウンロードします。<b>必ずWi-Fiで</b>行ってください。</p>
        <button class="btn primary big-btn" id="dl">ダウンロードする</button>
        <div class="progress" id="dlp" hidden><div></div></div><p class="small" id="dlm"></p></section>`;
      bindHeader();
      $('#dl').onclick = async () => {
        $('#dl').disabled = true; $('#dlp').hidden = false;
        try {
          const jw = await Voice.wordInfo('apple');
          await PronJudge.judge(new Float32Array(16000), jw, (p) => {
            if (p.phase === 'download') { $('#dlp div').style.width = Math.round(p.got / p.total * 100) + '%'; $('#dlm').textContent = `${Math.round(p.got / 1048576)} / ${Math.round(p.total / 1048576)}MB`; }
            else if (p.phase === 'prepare') $('#dlm').textContent = '準備中…';
          });
          resolve(true);
        } catch (e) { $('#dlm').textContent = e.message; $('#dl').disabled = false; }
      };
    });
  }

  // マイクが使えないときは先に進めない
  function micBlocked(L, step, msg) {
    return new Promise((resolve) => {
      main().innerHTML = lessonHeader(L, step) + `<section class="card center"><p class="big">🎤🚫</p>
        <h2>マイクをオンにしてください</h2><p>${esc(msg || '')}</p>
        <p class="small">このステップは、声を出さないと先に進めません。iPadの「設定」→ このアプリ（またはChrome）→「マイク」をオンにしてから、下のボタンを押してください。</p>
        <button class="btn primary" id="again">もう一度ためす</button></section>`;
      bindHeader();
      $('#again').onclick = resolve;
    });
  }

  // ===== ステップ2：発音 =====
  async function stepPron(L, words, st, next) {
    await ensureModel(L, 2);
    const list = words.slice();
    let i = st.sub || 0;
    const showWord = async () => {
      if (i >= list.length) return next();
      st.sub = i; saveState(st);
      const w = list[i], info = await Voice.wordInfo(w);
      let passes = 0, tries = 0, busy = false;
      main().innerHTML = lessonHeader(L, 2, bar(i, list.length)) + `
        <section class="card center">
          <p class="small muted">お手本を聞いたあと、続けて言おう（2回合格で次へ）</p>
          <p class="word">${esc(w)}</p>
          <p class="meaning">${esc(S.words[w].meaning)}</p>
          ${info && info.ipa ? `<p class="ipa">${esc(/^\//.test(info.ipa) ? info.ipa : `/${info.ipa}/`)}</p>` : ''}
          <div class="dots" id="dots"><span></span><span></span></div>
          <button class="btn primary big-btn" id="say">🔊 聞いて言う</button>
          <button class="btn small" id="listen">🔊 お手本だけ聞く</button>
          <div class="meter"><div id="lv"></div></div>
          <p id="msg" class="small"></p>
          <div id="res"></div>
          <div id="skip"></div>
        </section>`;
      bindHeader();
      const dots = () => { $('#dots').innerHTML = [0, 1].map((k) => `<span class="${k < passes ? 'on' : ''}"></span>`).join(''); };
      $('#listen').onclick = () => { Rec.audioCtx(); Voice.speak(w); };
      $('#say').onclick = async () => {
        if (busy) return; busy = true; Rec.audioCtx();
        const sayBtn = $('#say'); sayBtn.disabled = true;
        try {
          $('#msg').textContent = '🔊 お手本…';
          await Voice.speak(w);
          $('#msg').textContent = '🎙️ どうぞ！';
          const rec = await Voice.listen({ maxMs: 3500, onLevel: (v) => { const el = $('#lv'); if (el) el.style.width = Math.round(v * 100) + '%'; } });
          $('#lv').style.width = '0';
          $('#msg').textContent = '判定中…';
          const r = await Voice.judge(rec.blob, w, 'strict');
          tries++;
          $('#res').innerHTML = r.html;
          if (!r.pass && r.decision && r.decision.reasons) API.record({ type: 'pronTry', lesson: L.n, word: w, why: r.decision.reasons.map((x) => x.type === 'pair' ? x.ph + '→' + x.heard : x.type).join(',') });
          if (r.pass) { passes++; $('#msg').innerHTML = `<span class="fb ok">⭕ 合格！ ちゃんと「${esc(w)}」に聞こえたよ</span>`; }
          else $('#msg').innerHTML = `<span class="fb ng">おしい！</span><br><span class="small">${r.advice || 'もう一度言ってみよう。'}</span>`;
          dots();
          if (passes >= 2) {
            API.record({ type: 'pron', lesson: L.n, word: w, tries, pass: true });
            await sleep(1200); i++; return showWord();
          }
          if (tries - passes >= 10 && !$('#skipBtn')) {
            $('#skip').innerHTML = '<button class="btn" id="skipBtn">この単語は次へ進む（記録されます）</button>';
            $('#skipBtn').onclick = () => { API.record({ type: 'pron', lesson: L.n, word: w, tries, skipped: true }); i++; showWord(); };
          }
        } catch (e) {
          if (/マイク/.test(e.message)) { await micBlocked(L, 2, e.message); return showWord(); }
          $('#msg').textContent = e.message;
        } finally { busy = false; const b = $('#say'); if (b) b.disabled = false; }
      };
    };
    showWord();
  }

  // ===== ステップ3：書く練習（手書き＋発音 × 4回） =====
  async function stepWrite(L, words, st, next) {
    await ensureModel(L, 3);
    const list = words.slice();
    let i = st.sub || 0;
    const REPS = 4;
    const showWord = (rep) => {
      if (i >= list.length) return next();
      st.sub = i; saveState(st);
      const w = list[i], hidden = rep > 2;
      let recP = null, rec = null, busy = false;
      main().innerHTML = lessonHeader(L, 3, bar(i, list.length)) + `
        <section class="card center">
          <p class="small muted">声に出して言いながら、マスに1文字ずつ書こう（${rep}/${REPS}回目）</p>
          <p class="meaning">${esc(S.words[w].meaning)}</p>
          ${hidden ? '<p class="word hiddenw">？？？</p><p class="small muted">お手本は隠れています。思い出して書こう！</p>' : `<p class="word model">${esc(w)}</p>`}
          <div class="reps">${Array.from({ length: REPS }, (_, k) => `<span class="${k < rep - 1 ? 'on' : k === rep - 1 ? 'cur' : ''}"></span>`).join('')}</div>
          <div id="boxes"></div>
          <div class="row">
            <button class="btn small" id="undo">↩︎ 1画もどす</button>
            <button class="btn small" id="clr">🧽 全部消す</button>
            <button class="btn small" id="hear">🔊 お手本</button>
          </div>
          <p class="mic" id="mic">🎙️ 書き始めると、マイクがオンになります</p>
          <button class="btn primary big-btn" id="done" disabled>書けた！</button>
          <p id="msg" class="small"></p>
          <div id="res"></div>
        </section>`;
      bindHeader();
      const boxes = new HW.Boxes($('#boxes'), {
        count: w.length,
        onStroke: () => {
          if (!recP) {
            recP = Rec.start({ maxMs: 20000 }).then((r) => { rec = r; $('#mic').innerHTML = '🔴 録音中… 単語を言いながら書こう'; $('#mic').classList.add('on'); return r; })
              .catch(async (e) => { await micBlocked(L, 3, e.message); showWord(rep); });
          }
          $('#done').disabled = false;
        },
      });
      cleanups.push(() => { boxes.destroy(); if (rec) rec.stop(); });
      $('#undo').onclick = () => boxes.undo();
      $('#clr').onclick = () => boxes.clear();
      $('#hear').onclick = () => { Rec.audioCtx(); if (rec) { U.toast('録音中はお手本を鳴らせません。書き終わってから聞こう'); return; } Voice.speak(w); };
      $('#done').onclick = async () => {
        if (busy || !recP) return; busy = true; $('#done').disabled = true;
        try {
          await recP;
          if (!rec) { busy = false; return; }
          const r = await rec.stop(); rec = null;
          $('#mic').classList.remove('on'); $('#mic').textContent = '判定中…';
          const read = boxes.read();
          const pr = await Voice.judge(r.blob, w, 'loose');
          const letterOk = read.text === w;
          if (!pr.pass) {
            $('#msg').innerHTML = '<span class="fb ng">声が聞こえなかったか、単語が聞き取れなかったよ。<br>言いながら書くのがルール！ もう一度。</span>';
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: false, letterOk });
            await sleep(1800); return showWord(rep);
          }
          if (!hidden) {
            const learned = boxes.learnFrom(w);
            $('#msg').innerHTML = `<span class="fb ok">⭕ OK！</span> ${letterOk ? '' : `<span class="small muted">（AIには「${esc(read.text)}」と読めました。丁寧に書こう）</span>`}`;
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: true, letterOk, learned });
          } else if (!letterOk) {
            $('#msg').innerHTML = `<span class="fb ng">❌ AIには「${esc(read.text || '（空）')}」と読めました。正しくは <b>${esc(w)}</b>。もう一度！</span>`;
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: true, letterOk: false, read: read.text });
            await sleep(2500); return showWord(rep);
          } else {
            $('#msg').innerHTML = '<span class="fb ok">⭕ 完ぺき！</span>';
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: true, letterOk: true });
          }
          await sleep(900);
          if (rep < REPS) showWord(rep + 1); else { i++; showWord(1); }
        } catch (e) { $('#msg').textContent = e.message; busy = false; $('#done').disabled = false; }
      };
    };
    showWord(1);
  }

  // ===== ステップ4：書きのテスト =====
  function stepTest(L, words, st, next) {
    // st.test = { round, list, wrong, unlockAt }
    if (!st.test) { st.test = { round: 1, list: shuffle(words) }; saveState(st); }
    const T = st.test;
    if (T.unlockAt) return waitRetest(L, words, st, next); // 待ち時間中・待ち終わり（再開したとき）は、まず待ち画面を出す
    const maxLen = Math.max(...words.map((w) => w.length));
    const boxCount = Math.min(14, maxLen + 2); // 文字数が分からないよう、マスは多めに
    const results = [];
    let qi = 0;
    const ask = () => {
      if (qi >= T.list.length) return grade();
      const w = T.list[qi], limit = 15 + 3 * w.length;
      let left = limit, done = false, wentAway = false;
      main().innerHTML = lessonHeader(L, 4, bar(qi, T.list.length)) + `
        <section class="card center">
          <p class="small muted">${T.round === 1 ? '日本語の意味に合う単語を書こう。最初の文字は書いてあります。' : `再テスト：全問正解でクリア（${T.round}回目）`}</p>
          <p class="meaning big-m">${esc(S.words[w].meaning)}</p>
          <div class="timer"><div id="tb"></div></div>
          <div id="boxes"></div>
          <div class="row"><button class="btn small" id="undo">↩︎ 1画もどす</button><button class="btn small" id="clr">🧽 全部消す</button></div>
          <p class="small muted">使わないマスは空けておこう。丁寧に書かないと、正しく読み取れないことがあります。</p>
          <button class="btn primary big-btn" id="ans">答える</button>
          <div id="res"></div>
        </section>`;
      bindHeader();
      const boxes = new HW.Boxes($('#boxes'), { count: boxCount, prefilled: w[0] });
      const away = () => { if (document.hidden && !done) wentAway = true; };
      document.addEventListener('visibilitychange', away);
      const timer = setInterval(() => {
        left -= 0.25; const tb = $('#tb'); if (tb) { tb.style.width = Math.max(0, left / limit * 100) + '%'; tb.className = left < 5 ? 'low' : ''; }
        if (left <= 0) finish(true);
      }, 250);
      cleanups.push(() => { clearInterval(timer); boxes.destroy(); document.removeEventListener('visibilitychange', away); });
      $('#undo').onclick = () => boxes.undo();
      $('#clr').onclick = () => boxes.clear();
      const finish = async (timeout) => {
        if (done) return; done = true; clearInterval(timer); document.removeEventListener('visibilitychange', away);
        boxes.opt.disabled = true;
        const read = boxes.read();
        const ok = !timeout && !wentAway && read.text === w;
        results.push({ w, ok });
        API.record({ type: 'test', lesson: L.n, word: w, correct: ok, read: read.text, timeout: !!timeout, left: wentAway, round: T.round });
        $('#ans').disabled = true;
        $('#res').innerHTML = ok ? `<p class="fb ok">⭕ 正解！ ${esc(w)}</p>`
          : `<p class="fb ng">❌ 正解は <b>${esc(w)}</b>${timeout ? '（時間切れ）' : wentAway ? '（テスト中に画面を離れたため不正解）' : `<br><span class="small">AIには「${esc(read.text)}」と読めました</span>`}</p>`;
        await sleep(ok ? 1200 : 2600);
        qi++; ask();
      };
      $('#ans').onclick = () => finish(false);
    };
    const grade = () => {
      const right = results.filter((r) => r.ok).length, n = results.length;
      const wrong = results.filter((r) => !r.ok).map((r) => r.w);
      const pass = T.round === 1 ? right / n >= 0.8 : wrong.length === 0;
      API.flush();
      if (pass) { st.testScore = T.round === 1 ? `${right}/${n}` : (st.testScore || `${right}/${n}`); st.testRounds = T.round; delete st.test; saveState(st); return next(); }
      T.round++; T.list = shuffle(wrong.length ? wrong : T.list); T.unlockAt = Date.now() + 5 * 60000; T.last = `${right}/${n}`;
      if (T.round === 2) st.testScore = `${right}/${n}`;
      saveState(st);
      waitRetest(L, words, st, next);
    };
    ask();
  }
  function waitRetest(L, words, st, next) {
    const T = st.test;
    const tick = () => {
      const ms = T.unlockAt - Date.now();
      const el = $('#cd');
      if (ms <= 0) { clearInterval(t); if (el) { el.textContent = '再テストできます！'; $('#rt').disabled = false; } return; }
      if (el) el.textContent = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    };
    main().innerHTML = lessonHeader(L, 4) + `
      <section class="card center">
        <p class="big">📖</p><h2>おしい！ ${esc(T.last || '')}</h2>
        <p>合格は8割以上。間違えた単語だけで、<b>5分後</b>に再テストです（全問正解でクリア）。</p>
        <p class="countdown" id="cd"></p>
        <div class="review">${T.list.map((w) => `<div class="rv"><b>${esc(w)}</b><span>${esc(S.words[w].meaning)}</span><button class="btn small" data-say="${esc(w)}">🔊</button></div>`).join('')}</div>
        <p class="small muted">待っている間に、上の単語を声に出して、紙に書いて覚えよう。</p>
        <button class="btn primary big-btn" id="rt" disabled>再テストをはじめる</button>
      </section>`;
    bindHeader();
    main().querySelectorAll('[data-say]').forEach((b) => b.onclick = () => { Rec.audioCtx(); Voice.speak(b.dataset.say); });
    const t = setInterval(tick, 500); tick();
    cleanups.push(() => clearInterval(t));
    $('#rt').onclick = () => { delete T.unlockAt; saveState(st); stepTest(L, words, st, next); };
  }

  // ---------- レッスン完了 ----------
  async function finishLesson(L, words, st) {
    showLoading('記録しています…');
    tickClock();
    await API.flush();
    let j;
    try { j = await API.call('finishLesson', { n: L.n, summary: { test: st.testScore || '', rounds: st.testRounds || 1, words: words.length } }); }
    catch (e) { return showError(e.message); }
    if (j.ok) S.progress = j.progress;
    clearState(); stopAll();
    main().innerHTML = `<div class="center card celebrate">
      <p class="big">🏆</p><h2>レッスン ${L.n} クリア！</h2>
      <p>書きのテスト：${esc(st.testScore || '')}${st.testRounds > 1 ? `（再テスト ${st.testRounds - 1} 回）` : ''}</p>
      <p>${words.length} 語を、読んで・言って・書いて覚えました。</p>
      <button class="btn primary big-btn" id="home">マップに戻る</button></div>`;
    $('#home').onclick = showHome;
  }

  return { start, onProgress };
})();
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.start());
