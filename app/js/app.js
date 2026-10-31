// 英単語アプリ「単語の冒険」（試作品）：画面とレッスンの流れ
// 見た目：ことばの王国を救う、ファンタジーRPG風（本番デザイン）
const App = (() => {
  const CFG = window.APP_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => U.esc(s);
  const main = () => $('#main');
  const S = { email: '', words: {}, list: [], progress: null, config: null, today: '' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // 地方（6レッスンごと）と、そこに出るモンスター
  const REGIONS = [
    { name: 'はじまりの村', ic: '🏘️', mon: 'グリーンスライム', color: '#6cc45a', dark: '#2f6b18' },
    { name: '迷いの森', ic: '🌲', mon: 'もりスライム', color: '#3e9a6a', dark: '#1d4d33' },
    { name: '灼熱の砂漠', ic: '🏜️', mon: 'サンドスライム', color: '#d9a441', dark: '#8a5a12' },
    { name: '氷の山脈', ic: '🏔️', mon: 'アイススライム', color: '#8fd3f4', dark: '#2f6d8f' },
    { name: '天空の塔', ic: '🌩️', mon: 'サンダースライム', color: '#b58cff', dark: '#4b2a8a' },
  ];
  const region = (n) => REGIONS[Math.max(0, Math.min(REGIONS.length - 1, Math.floor((n - 1) / 6)))];
  const STEP_NAMES = [['📜', '呪文の書'], ['🎙️', '詠唱'], ['✍️', '刻印'], ['⚔️', '試練']];
  const CHEER = {
    right: ['会心の いちげき！', 'ことばの 力が きいた！', 'みごとな 一撃！', 'その調子じゃ！'],
    wrong: ['おしい！ でも ここで覚えれば 大丈夫！', '間違えた ことばほど、強くなれる！'],
    stepDone: ['ステップ クリア！', 'みごとじゃ！', 'あと少しじゃ！'],
  };

  // ---------- 背景 ----------
  function setScene(name) {
    document.body.dataset.scene = name;
    let st = $('#stars');
    if (!st) {
      st = document.createElement('div'); st.id = 'stars'; st.className = 'stars';
      let s = 7; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 110; i++) { const d = document.createElement('i'); const z = 1 + r() * 2.2; d.style.cssText = `left:${r() * 100}%;top:${r() * 75}%;width:${z}px;height:${z}px;opacity:${0.4 + r() * 0.6}`; st.appendChild(d); }
      document.body.prepend(st);
    }
    st.style.display = name === 'night' ? '' : 'none';
    document.querySelectorAll('.moon, .castle-land, .rays').forEach((e) => e.remove());
    window.scrollTo(0, 0);
  }

  // ---------- 起動 ----------
  async function start() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!API.loggedIn()) return showLogin();
    showLoading('冒険の記録を 読みこんでいます…');
    try {
      const j = await API.call('init');
      if (!j.ok) { if (!API.loggedIn()) return showLogin(j.error); return showError(j.error); }
      S.email = j.email; S.name = j.name || j.email.split('@')[0]; S.today = j.today; S.config = j.config; S.progress = j.progress;
      applyAppName(j.config.appName, j.config.subtitle);
      Voice.configure(j.config);
      S.list = j.words; S.words = {}; j.words.forEach((w) => { S.words[w.word] = w; });
      API.flush();
      showHome();
    } catch (e) { showError(e.message); }
  }
  function onProgress(p) { if (p) S.progress = p; }
  // アプリの名前（「設定」シートで変えられる。ログイン前にも出せるよう、端末にも覚えておく）
  function appName() { try { return localStorage.getItem('app-name') || '単語の冒険'; } catch { return '単語の冒険'; } }
  function appSub() { try { return localStorage.getItem('app-sub') || '〜 忘却の魔王から ことばの王国を救え 〜'; } catch { return ''; } }
  function applyAppName(name, sub) {
    try { if (name) localStorage.setItem('app-name', name); if (sub != null) localStorage.setItem('app-sub', sub); } catch { /* なし */ }
    document.title = appName();
  }
  document.title = appName();

  // ---------- 共通の画面 ----------
  function showLoading(msg) { setScene('night'); main().innerHTML = `<div class="loading"><div class="spinner"></div>${esc(msg)}</div>`; }
  function showError(msg) {
    setScene('night');
    main().innerHTML = `<div class="loading"><div class="parch" style="max-width:560px;margin:0 auto;font-family:var(--body)"><p style="font-size:44px;margin:0">😢</p><p>${esc(msg)}</p>
      <button class="gbtn" id="retry">もう一度ためす</button></div></div>`;
    $('#retry').onclick = start;
  }
  function owl(text, who = 'フクロウ先生') {
    return `<div class="rpg owl"><span class="who">${esc(who)}</span><span class="face">🦉</span>${text}<span class="tri">▼</span></div>`;
  }

  // ---------- ログイン ----------
  function showLogin(msg) {
    setScene('night');
    document.body.insertAdjacentHTML('beforeend', `<div class="moon"></div>
      <svg class="castle-land" viewBox="0 0 820 300" preserveAspectRatio="xMidYMax slice">
        <path d="M0 170 L120 110 L230 160 L340 90 L470 150 L600 100 L720 145 L820 115 L820 300 L0 300Z" fill="#1a1550"/>
        <g fill="#0c0a2c"><rect x="320" y="140" width="180" height="160"/><rect x="300" y="100" width="44" height="200"/><rect x="476" y="100" width="44" height="200"/>
        <rect x="385" y="60" width="50" height="240"/><polygon points="300,100 322,58 344,100"/><polygon points="476,100 498,58 520,100"/><polygon points="385,60 410,4 435,60"/>
        <rect x="316" y="124" width="9" height="14" fill="#ffd56b"/><rect x="494" y="124" width="9" height="14" fill="#ffd56b"/><rect x="404" y="92" width="11" height="18" fill="#ffd56b"/></g>
        <path d="M0 240 Q200 210 410 232 T820 218 L820 300 L0 300Z" fill="#070618"/></svg>`);
    main().innerHTML = `<div class="login-wrap">
      <div class="crest">📖</div>
      <div class="title">${esc(appName())}</div>
      <div class="subtitle">${esc(appSub())}</div>
      <div class="rpg"><span class="who">フクロウ先生</span>ようこそ、見習い冒険者よ。<br>うばわれた ことばを 取りもどし、王国を 救うのじゃ。<br>まずは 学校のアカウントで 名を名乗るがよい。<span class="tri">▼</span></div>
      ${msg ? `<p class="notice">${esc(msg)}</p>` : ''}
      <button class="gbtn" id="login">⚔️ 冒険をはじめる<small>（学校のGoogleアカウントでログイン）</small></button>
      <div class="foot">冬休みクエスト ｜ 締切：${esc(fmtJa(CFG.DEADLINE || '2027-01-12'))}<br>試作品：先生のアカウントだけが使えます</div>
    </div>`;
    $('#login').onclick = API.login;
  }
  function fmtJa(iso) { const [, m, d] = iso.split('-').map(Number); return `${m}月${d}日`; }

  // ---------- 記録から計算する数字 ----------
  function fmtDay(d) { return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
  function streak() {
    const days = Object.keys((S.progress && S.progress.days) || {});
    if (!days.length) return 0;
    const set = new Set(days);
    let d = new Date(S.today + 'T00:00:00+09:00'), n = 0;
    if (!set.has(fmtDay(d))) d = new Date(d.getTime() - 86400000);
    while (set.has(fmtDay(d))) { n++; d = new Date(d.getTime() - 86400000); }
    return n;
  }
  function lessonStatus(n) {
    const L = S.progress.lessons[n];
    if (L && L.done) return 'done';
    for (let i = 1; i < n; i++) { const P = S.progress.lessons[i]; if (!P || !P.done) return 'locked'; }
    return L ? 'doing' : 'next';
  }
  function learnedWords() {
    const set = new Set();
    Object.values(S.progress.lessons).forEach((L) => { if (L.done) L.words.concat(L.review || []).forEach((w) => set.add(w)); });
    return set.size;
  }
  function testRate() {
    let r = 0, w = 0;
    Object.values(S.progress.stats || {}).forEach((s) => { r += s.tRight || 0; w += s.tWrong || 0; });
    return r + w ? Math.round(r / (r + w) * 100) : null;
  }
  function summary() {
    const P = S.progress, total = P.lessonCount;
    const done = Object.keys(P.lessons).filter((k) => P.lessons[k].done).length;
    let cur = 0; for (let n = 1; n <= total; n++) { const s = lessonStatus(n); if (s === 'next' || s === 'doing') { cur = n; break; } }
    const left = total - done;
    const deadline = new Date((CFG.DEADLINE || '2027-01-12') + 'T23:59:59+09:00');
    const daysLeft = Math.max(0, Math.ceil((deadline - new Date(S.today + 'T00:00:00+09:00')) / 86400000));
    const needPerDay = daysLeft ? left / daysLeft : left;
    const todayLeft = Math.max(0, P.dailyLimit - P.todayCount);
    const curStatus = cur ? lessonStatus(cur) : null;
    const canStart = !!cur && (curStatus === 'doing' || todayLeft > 0);
    // このペースで進んだときに終わる日（1日の上限でやった場合）
    const finishDays = Math.ceil(Math.max(0, left - Math.min(left, todayLeft)) / P.dailyLimit);
    const finishDate = fmtJa(fmtDay(new Date(new Date(S.today + 'T00:00:00+09:00').getTime() + finishDays * 86400000))); // 日本時間で計算
    return { P, total, done, cur, left, daysLeft, needPerDay, todayLeft, curStatus, canStart, finishDate, behind: needPerDay > P.dailyLimit };
  }

  // ---------- 村（メニュー） ----------
  function showHome() {
    stopAll(); setScene('village');
    const m = summary(), P = m.P;
    const name = S.name;
    // 本日のクエスト：今日始めたレッスン ＋ 今日あとできるレッスン（1日の上限まで）
    const todays = Object.values(P.lessons).filter((L) => L.startedDay === S.today).map((L) => L.n).sort((a, b) => a - b);
    const slots = [];
    todays.forEach((n) => slots.push({ n, st: P.lessons[n].done ? 'done' : 'now' }));
    let nx = m.cur && !todays.includes(m.cur) ? m.cur : (todays.length ? Math.max(...todays) + 1 : m.cur);
    while (slots.length < P.dailyLimit && nx && nx <= m.total) { slots.push({ n: nx, st: slots.some((s) => s.st === 'now') || m.todayLeft <= 0 ? 'lock' : 'now' }); nx++; }
    const first = slots.length ? slots[0].n : 0, lastN = slots.length ? slots[slots.length - 1].n : 0;
    const allDoneToday = slots.length && slots.every((s) => s.st === 'done');
    const reg = m.cur ? region(m.cur) : REGIONS[REGIONS.length - 1];
    let talk;
    if (!m.cur) talk = 'ホッホー、すべての レッスンを 攻略したな！ 最終試験に そなえて 復習じゃ。';
    else if (m.curStatus === 'doing') talk = `レッスン${m.cur}の つづきが 待っておるぞ。途中から 再開できるのじゃ。`;
    else if (!m.canStart) talk = '今日の クエストは 達成じゃ！ よく休んで、明日 また会おう。';
    else if (m.done === 0) talk = 'まずは レッスン1から 冒険を はじめるのじゃ。読んで・言って・書いて、ことばを 取りもどせ！';
    else {
      const lastDone = Object.values(P.lessons).filter((L) => L.done).sort((a, b) => b.n - a.n)[0];
      talk = lastDone && lastDone.summary && lastDone.summary.test ? `前回の 書きの試練は ${esc(lastDone.summary.test)} じゃったな。今日も その調子じゃ！` : '今日も 一歩ずつ 進むのじゃ！';
    }
    if (m.behind && m.cur) talk = `このままでは 締切に 間に合わんぞ！ 今日から 毎日 ${P.dailyLimit}つ 進めるのじゃ。`;
    const pop = P.pop || {}, F = P.final || {};
    const popWaiting = !!(pop.pending || pop.remedial);
    if (popWaiting) talk = pop.remedial ? '修行の書が 待っておるぞ。修行を 終えて、ドラゴンを 撃退するのじゃ！' : 'ドラゴンが 村の外で 待ちかまえておる！ 撃退するまで 先へは 進めんぞ。';
    if (F.passed) talk = 'きみは 王国を 救った 英雄じゃ！ 2周目で さらに 力を みがくのも よいぞ。';
    const tryAny = S.config && S.config.tryAnytime;
    const qsHtml = slots.map((s) => `<div class="qs ${s.st}"><span class="ic">${s.st === 'done' ? '✅' : s.st === 'now' ? '⚔️' : '🔒'}</span>レッスン${s.n}<br><small>${s.st === 'done' ? 'クリア！' : s.st === 'now' ? (lessonStatus(s.n) === 'doing' ? 'つづきから' : 'これから') : ''}</small></div>`).join('');
    main().innerHTML = `
      <div class="hud">
        <div class="avatar">🧝</div>
        <div class="who2"><div class="name">冒険者 ${esc(name)}</div><div class="sub2">${esc(reg.ic + ' ' + reg.name)}を 冒険中</div></div>
        <div class="res"><span class="pill">🔥 ${streak()}日</span><span class="pill">🗡️ ${learnedWords()}語</span><span class="pill">⏱ ${Math.round((P.studySec || 0) / 60)}分</span></div>
        <button class="gear" id="gear" aria-label="設定">⚙️</button>
      </div>
      <div class="doom${m.behind ? ' warn' : ''}">⏳ 魔王の封印がとけるまで あと <b>${m.daysLeft}</b> 日 ｜ ${m.left ? (m.behind ? '<b>ペースが足りない！</b>' : `このペースなら <b>${m.finishDate}</b> にクリア！`) : '<b>全レッスン攻略！</b>'}</div>
      <div class="two">
        <section class="parch quest">
          <h2>📜 本日のクエスト</h2>
          <div class="q">${slots.length ? `「${esc(reg.name)}」の レッスン${first}${lastN > first ? `〜${lastN}` : ''}を 攻略せよ！` : '全レッスン 攻略ずみ！'}</div>
          <div class="qsteps">${qsHtml}</div>
          ${popWaiting ? `<div class="notice alarmbox">⚠ ${pop.remedial ? '修行の書が 待っている！ 修行を 終えて 再戦せよ' : 'ワードモンスターが 待ちかまえている！'}<br><small>撃退するまで、次の レッスンには 進めない</small></div>
            <button class="gbtn red" id="toPop">${pop.remedial ? '📖 修行の書を ひらく' : '🐉 たたかいに いく'}</button>` : ''}
          ${!m.cur && !F.passed ? '<button class="gbtn" id="toFinal">🏰 魔王城へ（最終試験）</button>' : ''}
          ${F.passed ? '<div class="notice">👑 最終試験 合格！ 王国を 救った！</div>' : ''}
          ${m.cur && !popWaiting ? `<button class="gbtn" id="go" ${m.canStart ? '' : 'disabled'}>${m.canStart ? (m.curStatus === 'doing' ? '▶ つづきから 冒険する' : `▶ レッスン${m.cur}へ 出発！`) : (allDoneToday ? '今日のクエスト 達成！' : 'また明日 冒険しよう')}</button>` : ''}
        </section>
        <div>
          <div class="village"><span>🌳</span><span>🏠</span><span>⛪</span><span>🏡</span><span>🌲</span></div>
          <div class="tiles">
            <button class="tile" id="toMap"><span class="ic">🗺️</span><span class="t">冒険マップ</span></button>
            <button class="tile" id="toSet"><span class="ic">⚙️</span><span class="t">設定</span></button>
          </div>
          ${owl(talk)}
          ${tryAny ? `<section class="parch trybox"><b>🧪 試作品用</b>（本番では出ません）
            <div class="row"><button class="btn" id="tryPop">🐉 抜き打ちテストを ためす</button>${F.passed ? '' : '<button class="btn" id="tryFinal">🏰 最終試験を ためす</button>'}</div></section>` : ''}
          ${API.pending() ? `<p class="pending">送信待ちの記録：${API.pending()}件（電波のよい場所で自動で送ります）</p>` : ''}
        </div>
      </div>`;
    $('#gear').onclick = showSettings; $('#toSet').onclick = showSettings; $('#toMap').onclick = showMap;
    const go = $('#go'); if (go) go.onclick = () => openLesson(m.cur);
    const tp = $('#toPop'); if (tp) tp.onclick = () => (pop.remedial ? remedialIntro(pop.remedial.words) : showPop(false));
    const tf = $('#toFinal'); if (tf) tf.onclick = showFinal;
    const yp = $('#tryPop'); if (yp) yp.onclick = () => showPop(true);
    const yf = $('#tryFinal'); if (yf) yf.onclick = showFinal;
  }

  // ---------- 冒険マップ・進み具合 ----------
  function showMap() {
    stopAll(); setScene('map');
    const m = summary();
    const learned = learnedWords(), totalWords = S.list.length, rate = testRate();
    const pct = totalWords ? Math.round(learned / totalWords * 100) : 0;
    main().innerHTML = `
      <div class="lhead"><button class="back" id="toVillage">← 村へ</button><span class="ttl">冒険マップ</span><span class="cnt"></span></div>
      <div class="two map">
        <div class="mapframe"><h2>ことばの王国 全図</h2>${mapSvg(m.total, m.cur)}</div>
        <section class="panel statpanel">
          <div class="ring" style="background:conic-gradient(var(--gold) 0 ${pct}%, rgba(255,255,255,.12) ${pct}% 100%)"><div><b>${learned}</b>/ ${totalWords}語<br><span class="muted">取りもどした ことば</span></div></div>
          <div class="stats">
            <div class="st"><div class="k">攻略したレッスン</div><div class="v">${m.done} / ${m.total}</div></div>
            <div class="st"><div class="k">書きの試練 正答率</div><div class="v">${rate == null ? '―' : rate + '%'}</div></div>
            <div class="st"><div class="k">連続日数</div><div class="v">🔥 ${streak()}日</div></div>
            <div class="st"><div class="k">学習時間</div><div class="v">⏱ ${Math.round((m.P.studySec || 0) / 60)}分</div></div>
            <div class="st"><div class="k">撃退した モンスター</div><div class="v">🐉 ${popWins()}回</div></div>
            <div class="st"><div class="k">最終試験</div><div class="v">${m.P.final && m.P.final.passed ? '👑 合格' : `${(m.P.final && m.P.final.tries) || 0} / ${(m.P.final && m.P.final.max) || 5}回`}</div></div>
            <div class="st" style="grid-column:1/-1"><div class="k">締切まで</div><div class="v">⏳ あと ${m.daysLeft}日（残り ${m.left}レッスン）</div></div>
          </div>
        </section>
      </div>`;
    $('#toVillage').onclick = showHome;
    const cs = $('#castle'); if (cs) cs.addEventListener('click', () => {
      const F = m.P.final || {};
      if (F.passed) U.toast('魔王は もう たおした！');
      else if (!m.cur || (S.config && S.config.tryAnytime)) showFinal();
      else U.toast('すべての レッスンを 攻略すると、魔王城に 入れる');
    });
    main().querySelectorAll('[data-lesson]').forEach((g) => g.addEventListener('click', () => {
      const n = Number(g.dataset.lesson), s = lessonStatus(n);
      if (s === 'done') U.toast(`レッスン ${n} は 攻略ずみ！（2周目は準備中）`);
      else if (s === 'locked') U.toast('前の レッスンを 攻略すると 進めます');
      else if (m.canStart) openLesson(n);
      else U.toast('今日の クエストは ここまで。また明日！');
    }));
  }
  function mapSvg(total, cur) {
    const per = Math.min(6, total), rows = Math.ceil(total / per);
    const W = 772, top = 150, gapY = 150, H = top + (rows - 1) * gapY + 110, left = 90, right = 690;
    const pts = [];
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / per), c = i % per, cc = r % 2 === 0 ? c : per - 1 - c;
      const x = per === 1 ? (left + right) / 2 : left + (right - left) * cc / (per - 1);
      pts.push([x, H - 70 - r * gapY + (cc % 2 ? -12 : 12)]);
    }
    const last = pts[pts.length - 1];
    const castle = [last[0] > W / 2 ? last[0] - 10 : last[0] + 10, Math.max(70, last[1] - 95)];
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (y0 - y1 > 60) d += ` C${x0 + (x0 > W / 2 ? 80 : -80)},${y0} ${x1 + (x1 > W / 2 ? 80 : -80)},${y1} ${x1},${y1}`;
      else d += ` Q${(x0 + x1) / 2},${(y0 + y1) / 2 + 16} ${x1},${y1}`;
    }
    d += ` Q${last[0]},${(last[1] + castle[1]) / 2} ${castle[0]},${castle[1] + 20}`;
    let g = `<path d="${d}" fill="none" stroke="#8a6234" stroke-width="12" stroke-dasharray="2 18" stroke-linecap="round" opacity=".8"/>`;
    for (let r = 0; r < rows; r++) {
      const reg = region(r * per + 1), y = H - 70 - r * gapY - 66;
      const lo = r * per + 1, hi = Math.min(total, (r + 1) * per);
      const label = `${reg.ic} ${reg.name}　${lo}〜${hi}`;
      g += `<g><rect x="${W / 2 - 150}" y="${y - 22}" width="300" height="36" rx="8" fill="rgba(255,248,230,.75)" stroke="#6b5232" stroke-width="2"/><text x="${W / 2}" y="${y + 4}" text-anchor="middle" font-size="20" fill="#3b2a14" class="region">${label}</text></g>`;
    }
    pts.forEach(([x, y], i) => {
      const n = i + 1, s = lessonStatus(n);
      g += `<g class="node" data-lesson="${n}" role="button">`;
      if (s === 'done') g += `<circle cx="${x}" cy="${y}" r="24" fill="#f7c948" stroke="#fff" stroke-width="4"/><text x="${x}" y="${y + 8}" text-anchor="middle" font-size="22" fill="#8a5a12">★</text>`;
      else if (n === cur) g += `<circle cx="${x}" cy="${y}" r="40" fill="#4aa3ff" class="pulse"/><circle cx="${x}" cy="${y}" r="28" fill="#2563eb" stroke="#fff" stroke-width="5"/><text x="${x}" y="${y + 9}" text-anchor="middle" font-size="24" fill="#fff">${n}</text><text x="${x}" y="${y - 40}" text-anchor="middle" font-size="44" class="hero-bob">🧝</text>`;
      else g += `<circle cx="${x}" cy="${y}" r="22" fill="#b8a58a" stroke="#fff8e6" stroke-width="3"/><text x="${x}" y="${y + 7}" text-anchor="middle" font-size="18" fill="#fff">${n}</text>`;
      g += '</g>';
    });
    g += `<g id="castle" class="node" role="button"><text x="${castle[0]}" y="${castle[1]}" text-anchor="middle" font-size="64">🏰</text><text x="${castle[0]}" y="${castle[1] + 30}" text-anchor="middle" font-size="15" fill="#3a0a4a" class="region">魔王城（最終試験）</text></g>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="mapsvg">${g}</svg>`;
  }

  // ---------- 設定 ----------
  async function showSettings() {
    stopAll(); setScene('night');
    const cached = await Voice.modelReady();
    main().innerHTML = `
      <div class="lhead"><button class="back" id="home">← 村へ</button><span class="ttl">設定</span><span class="cnt"></span></div>
      <div class="two">
        <div>
          <section class="parch setting"><h2>アカウント</h2><p>${esc(S.email)}</p><button class="btn" id="logout">ログアウト</button></section>
          <section class="parch setting"><h2>発音判定のAI</h2><p>${cached ? '✅ この端末に保存ずみ' : '未保存（詠唱のステップの前にダウンロードします）'}</p></section>
          <section class="parch setting"><h2>手書きの学習データ</h2><p>この端末で覚えた、あなたの字の手本：${HW.personalCount()}文字分</p><button class="btn" id="forget">手書きの学習データを消す</button></section>
          <section class="parch setting"><h2>試作品用</h2><p class="small">進み具合をすべて消して、レッスン1からやり直します。</p><button class="btn danger" id="reset">進み具合をリセット</button></section>
        </div>
        <section class="parch setting small"><h2>このアプリについて</h2>
          <p>発音判定：HuBERT 音素認識モデル（ron-jo/hubert-base-phoneme-en-onnx・Apache-2.0）、ONNX Runtime Web（MIT）、CMU Pronouncing Dictionary（BSD）、Moby Hyphenator II（パブリックドメイン）。</p>
          <p>文字：DotGothic16、Mochiy Pop One、Zen Maru Gothic、Kaisei Decol（いずれも SIL Open Font License）。</p>
          <p>AIの判定は目安です。先生のお手本や辞書の音声も聞きましょう。手書きの読み取りも、丁寧に書かないと正しく読めないことがあります。</p>
          <p>録音した声は、この端末の中だけで処理し、どこにも送りません。</p></section>
      </div>`;
    $('#home').onclick = showHome;
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
    showLoading('レッスンを 準備しています…');
    let j;
    try { j = await API.call('startLesson', { n }); } catch (e) { return showError(e.message); }
    if (!j.ok) { S.progress = j.progress || S.progress; if (j.code === 'pop') return showPop(false); U.toast(j.error); return showHome(); }
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
    if (st.step > 4) return L.kind === 'remedial' ? remedialDone() : finishLesson(L, words, st);
    await steps[st.step](L, words, st, async () => {
      API.record({ type: 'step', lesson: L.n, step: st.step });
      API.flush();
      st.step++; delete st.sub; saveState(st);
      if (st.step <= 4) await stepBreak(st.step - 1);
      runStep(L, words, st);
    });
  }
  // レッスン中の上の帯（戻る・タイトル・4つのステップ・進み具合）
  function lessonHeader(L, step, i, n) {
    const reg = region(L.n);
    const ttl = L.kind === 'remedial' ? '📖 修行の書（抜き打ちの補習）' : `レッスン${L.n}　${esc(reg.name)}`;
    return `<div class="lhead"><button class="back" id="back">← 村へ</button><span class="ttl">${ttl}</span><span class="cnt">${n ? `${i} / ${n}` : ''}</span></div>
      <div class="gems">${STEP_NAMES.map(([ic, nm], k) => `<div class="gem ${k + 1 < step ? 'done' : k + 1 === step ? 'now' : ''}"><span class="g">${ic}</span>${k + 1}. ${nm}</div>`).join('')}</div>
      ${n ? `<div class="bar lprog"><div style="width:${Math.round(i / n * 100)}%"></div></div>` : ''}`;
  }
  function bindHeader() {
    const b = $('#back'); if (b) b.onclick = () => { if (confirm('村に戻りますか？（このステップは最初からになります）')) { stopAll(); showHome(); } };
  }
  function stepBreak(done) {
    return new Promise((res) => {
      setScene('night');
      const [ic, nm] = STEP_NAMES[done - 1], [ic2, nm2] = STEP_NAMES[done];
      main().innerHTML = `<div class="celebrate step-clear"><p class="big">${ic}</p><h1>${esc(pick(CHEER.stepDone))}</h1>
        <p style="font-family:var(--pop);font-size:20px">「${nm}」を 修めた！ つぎは「${nm2}」${ic2}</p>
        <button class="gbtn" id="nx">つぎの ステップへ</button></div>`;
      $('#nx').onclick = res;
    });
  }
  function slimeSvg(reg) {
    return `<svg viewBox="0 0 190 150"><ellipse cx="95" cy="140" rx="80" ry="10" fill="rgba(0,0,0,.35)"/><path d="M15 135 C10 90 40 40 95 20 C150 40 180 90 175 135 Z" fill="${reg.color}" stroke="${reg.dark}" stroke-width="5"/><path d="M40 70 C55 45 75 35 90 32" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".55"/><ellipse cx="70" cy="90" rx="12" ry="16" fill="#2b1a08"/><ellipse cx="120" cy="90" rx="12" ry="16" fill="#2b1a08"/><circle cx="74" cy="84" r="4" fill="#fff"/><circle cx="124" cy="84" r="4" fill="#fff"/><path d="M78 115 Q95 128 112 115" stroke="#2b1a08" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
  }

  // ===== ステップ1：呪文の書（穴うめ） =====
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
    setScene('night');
    const reg = region(L.n);
    let queue = shuffle(words).map((w) => ({ w, ex: chooseEx(w), tries: 0 }));
    const total = queue.length; let doneN = 0, combo = 0;
    const show = () => {
      if (!queue.length) return next();
      const q = queue[0];
      const others = shuffle(words.filter((x) => x !== q.w)).slice(0, 3);
      const choices = shuffle([q.w].concat(others));
      const t0 = Date.now(); let hintUsed = false, answered = false;
      main().innerHTML = lessonHeader(L, 1, doneN, total) + `
        <div class="quiz">
          <div class="arena">
            <div class="enemy" id="enemy"><div class="nm">${esc(reg.mon)}</div>${slimeSvg(reg)}<div class="bar hp"><div style="width:${Math.round((total - doneN) / total * 100)}%"></div></div></div>
            <div class="dmg" id="dmg">-1</div>
            ${combo >= 2 ? `<div class="combo">${combo} コンボ！<small>正解で こうげき</small></div>` : ''}
            <div class="hero">🧝</div>
          </div>
          <div>
            <section class="parch scroll">
              <p class="lead">空らんに入る ことばを えらべ！</p>
              <p class="sentence">${blankHtml(q.ex)}</p>
              <div id="hint"><button class="hintbtn" id="hintBtn" disabled><span class="hring" id="hr"></span>💡 ヒントの巻物まで あと <span id="hs">15</span> 秒</button></div>
            </section>
            <div class="runes">${choices.map((c) => `<button class="choice" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
          </div>
        </div>
        <div class="rpg" id="fb">▶ 正しい ことばを えらんで、${esc(reg.mon)}に こうげきだ！<span class="tri">▼</span></div>`;
      bindHeader();
      let left = 15;
      const ring = () => { const hr = $('#hr'); if (hr) hr.style.background = `conic-gradient(var(--gold2) 0 ${(15 - left) / 15 * 100}%, rgba(0,0,0,.15) 0)`; };
      ring();
      const timer = setInterval(() => {
        left--; const hs = $('#hs'); if (hs) hs.textContent = left; ring();
        if (left <= 0) { clearInterval(timer); const hb = $('#hintBtn'); if (hb) { hb.disabled = false; hb.innerHTML = '📜 ヒントの巻物を ひらく（和訳）'; } }
      }, 1000);
      cleanups.push(() => clearInterval(timer));
      $('#hintBtn').onclick = () => { hintUsed = true; $('#hint').innerHTML = `<p class="ja">💡 ${esc(q.ex.ja)}</p>`; };
      main().querySelectorAll('.choice').forEach((b) => b.onclick = async () => {
        if (answered) return; answered = true; clearInterval(timer);
        const ok = b.dataset.c === q.w;
        API.record({ type: 'quiz', lesson: L.n, word: q.w, correct: ok, hint: hintUsed, ms: Date.now() - t0, try: q.tries + 1 });
        main().querySelectorAll('.choice').forEach((x) => { x.disabled = true; if (x.dataset.c === q.w) x.classList.add('right'); });
        const ja = esc(q.ex.ja.replace('（　　）', `（${S.words[q.w].meaning}）`));
        if (ok) {
          combo++; doneN++;
          $('#enemy').classList.add('hit'); $('#dmg').classList.add('show');
          const hp = $('#enemy .hp div'); if (hp) hp.style.width = Math.round((total - doneN) / total * 100) + '%';
          $('#fb').innerHTML = `<span class="ok">⭕ ${esc(pick(CHEER.right))}</span>${combo >= 2 ? ` ${combo}コンボ！` : ''}<br><span style="font-family:var(--en)">${fullHtml(q.ex)}</span><br><span class="small">${ja}</span><span class="tri">▼</span>`;
          queue.shift();
          await sleep(1500);
        } else {
          combo = 0;
          b.classList.add('wrong');
          $('#fb').innerHTML = `<span class="ng">❌ ${esc(pick(CHEER.wrong))}</span> 正解は <b>${esc(q.w)}</b>（${esc(S.words[q.w].meaning)}）<br><span style="font-family:var(--en)">${fullHtml(q.ex)}</span><br><span class="small">${ja}</span><br><span class="small">この問題は、あとで もう一度 出るぞ。</span><div style="text-align:right"><button class="btn" id="ok" disabled>3</button></div>`;
          q.tries++; queue.push(queue.shift());
          const okb = $('#ok');
          for (let s = 3; s > 0; s--) { okb.textContent = String(s); await sleep(1000); }
          okb.disabled = false; okb.textContent = 'つぎへ ▶';
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
      setScene('night');
      main().innerHTML = lessonHeader(L, step) + `<section class="parch" style="text-align:center;max-width:640px;margin:20px auto">
        <p style="font-size:56px;margin:0">🎙️</p><h2 style="font-family:var(--title)">発音判定のAIを 準備します</h2>
        <p>初回だけ、約116MBを ダウンロードします。<b>Wi-Fi（または データ使用量が 無制限の回線）</b>で 行ってください。</p>
        <p class="small">途中で 電波が 切れたり、画面を 閉じたりすると、最初から やり直しに なります。終わるまで この画面の ままに しておいてください。</p>
        <button class="gbtn" id="dl">ダウンロードする</button>
        <div class="bar xp" id="dlp" hidden style="margin-top:12px"><div style="width:0"></div></div><p class="small" id="dlm"></p></section>`;
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
      setScene('night');
      main().innerHTML = lessonHeader(L, step) + `<section class="parch" style="text-align:center;max-width:640px;margin:20px auto"><p style="font-size:56px;margin:0">🎤🚫</p>
        <h2 style="font-family:var(--title)">マイクを オンにしてください</h2><p>${esc(msg || '')}</p>
        <p class="small">このステップは、声を出さないと 先に進めません。iPadの「設定」→ このアプリ（またはChrome）→「マイク」をオンにしてから、下のボタンを押してください。</p>
        <button class="gbtn" id="again">もう一度ためす</button></section>`;
      bindHeader();
      $('#again').onclick = resolve;
    });
  }

  // ===== ステップ2：詠唱（発音） =====
  async function stepPron(L, words, st, next) {
    await ensureModel(L, 2);
    setScene('night');
    const list = words.slice();
    let i = st.sub || 0;
    const showWord = async () => {
      if (i >= list.length) return next();
      st.sub = i; saveState(st);
      const w = list[i], info = await Voice.wordInfo(w);
      let passes = 0, tries = 0, busy = false;
      const NEED = Math.max(1, Number((S.config && S.config.pronNeed) || 1)); // 合格に必要な回数（「設定」シートで変えられる）
      main().innerHTML = lessonHeader(L, 2, i, list.length) + `
        <div class="two">
          <section class="parch wordcard">
            <p class="small muted" style="font-weight:700">お手本を 聞いたあと、続けて 唱えよ（${NEED}回 合格で 次へ）</p>
            <p class="word">${esc(w)}</p>
            <p class="meaning">${esc(S.words[w].meaning)}</p>
            ${info && info.ipa ? `<p class="ipa">${esc(/^\//.test(info.ipa) ? info.ipa : `/${info.ipa}/`)}</p>` : ''}
            <div class="stars2" id="dots">${'<span>⭐</span>'.repeat(NEED)}</div>
            <button class="gbtn" id="say">🔊 聞いて 唱える</button>
            <button class="btn small" id="listen">🔊 お手本だけ 聞く</button>
            <div class="meter"><div id="lv"></div></div>
          </section>
          <div>
            <div class="rpg" id="msg">▶ 「聞いて 唱える」を 押すと、お手本のあとに 録音が 始まるぞ。<span class="tri">▼</span></div>
            <div class="parch" id="resWrap" hidden><div id="res"></div></div>
            <div id="skip" class="center-t"></div>
          </div>
        </div>`;
      bindHeader();
      const dots = () => { $('#dots').innerHTML = Array.from({ length: NEED }, (_, k) => k).map((k) => `<span class="${k < passes ? 'on' : ''}">⭐</span>`).join(''); };
      $('#listen').onclick = () => { Rec.audioCtx(); Voice.speak(w); };
      $('#say').onclick = async () => {
        if (busy) return; busy = true; Rec.audioCtx();
        const sayBtn = $('#say'); sayBtn.disabled = true;
        try {
          $('#msg').innerHTML = '🔊 お手本を 聞くのじゃ…';
          await Voice.speak(w);
          $('#msg').innerHTML = '🎙️ さあ、唱えよ！';
          const rec = await Voice.listen({ maxMs: 3500, onLevel: (v) => { const el = $('#lv'); if (el) el.style.width = Math.round(v * 100) + '%'; } });
          $('#lv').style.width = '0';
          $('#msg').innerHTML = '…判定中…';
          const r = await Voice.judge(rec.blob, w, 'strict');
          tries++;
          $('#res').innerHTML = r.html; $('#resWrap').hidden = false;
          if (!r.pass && r.decision && r.decision.reasons) API.record({ type: 'pronTry', lesson: L.n, word: w, why: r.decision.reasons.map((x) => x.type === 'pair' ? x.ph + '→' + x.heard : x.type).join(',') });
          if (r.pass) { passes++; $('#msg').innerHTML = `<span class="ok">⭕ 合格！</span> ちゃんと「<b>${esc(w)}</b>」に 聞こえたぞ。<span class="tri">▼</span>`; }
          else $('#msg').innerHTML = `<span class="ng">おしい！</span><br>${r.advice || 'もう一度 言ってみよう。'}<span class="tri">▼</span>`;
          dots();
          if (passes >= NEED) {
            API.record({ type: 'pron', lesson: L.n, word: w, tries, pass: true });
            await sleep(1200); i++; return showWord();
          }
          if (tries - passes >= 10 && !$('#skipBtn')) {
            $('#skip').innerHTML = '<button class="btn" id="skipBtn">この単語は 次へ進む（記録されます）</button>';
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

  // ===== ステップ3：刻印（書く練習：手書き＋発音 × 4回） =====
  async function stepWrite(L, words, st, next) {
    await ensureModel(L, 3);
    setScene('night');
    const list = words.slice();
    let i = st.sub || 0;
    const REPS = 4;
    const showWord = (rep) => {
      if (i >= list.length) return next();
      st.sub = i; saveState(st);
      const w = list[i], hidden = rep > 2;
      let recP = null, rec = null, busy = false;
      main().innerHTML = lessonHeader(L, 3, i, list.length) + `
        <section class="parch" style="text-align:center">
          <p class="small muted" style="font-weight:700">声に出して 唱えながら、石版に 1文字ずつ きざめ（${rep} / ${REPS}回目）</p>
          <div class="reps">${Array.from({ length: REPS }, (_, k) => `<span class="${k < rep - 1 ? 'on' : k === rep - 1 ? 'cur' : ''}"></span>`).join('')}</div>
          <p class="meaning">${esc(S.words[w].meaning)}</p>
          ${hidden ? '<p class="word hiddenw">？？？</p><p class="small muted">お手本は 隠れている。思い出して きざめ！</p>' : `<p class="word">${esc(w)}</p>`}
          <div id="boxes"></div>
          <div class="row">
            <button class="btn small" id="undo">↩︎ 1画もどす</button>
            <button class="btn small" id="clr">🧽 全部消す</button>
            <button class="btn small" id="hear">🔊 お手本</button>
          </div>
          <p class="mic" id="mic">🎙️ 書き始めると、マイクが オンになります</p>
          <button class="gbtn" id="done" disabled>✍️ きざめた！</button>
          <div id="res"></div>
        </section>
        <div class="rpg" id="msg">▶ 赤い線が 基準線じゃ。ていねいに 書かないと、石版が 読み取れないぞ。<span class="tri">▼</span></div>`;
      bindHeader();
      if (!hidden) main().querySelector('.word').classList.add('model');
      const boxes = new HW.Boxes($('#boxes'), {
        count: w.length,
        onStroke: () => {
          if (!recP) {
            recP = Rec.start({ maxMs: 20000 }).then((r) => { rec = r; $('#mic').innerHTML = '🔴 録音中… 単語を 唱えながら 書こう'; $('#mic').classList.add('on'); return r; })
              .catch(async (e) => { await micBlocked(L, 3, e.message); showWord(rep); });
          }
          $('#done').disabled = false;
        },
      });
      cleanups.push(() => { boxes.destroy(); if (rec) rec.stop(); });
      $('#undo').onclick = () => boxes.undo();
      $('#clr').onclick = () => boxes.clear();
      $('#hear').onclick = () => { Rec.audioCtx(); if (rec) { U.toast('録音中は お手本を 鳴らせません。書き終わってから 聞こう'); return; } Voice.speak(w); };
      $('#done').onclick = async () => {
        if (busy || !recP) return; busy = true; $('#done').disabled = true;
        try {
          await recP;
          if (!rec) { busy = false; return; }
          const r = await rec.stop(); rec = null;
          $('#mic').classList.remove('on'); $('#mic').textContent = '…判定中…';
          const read = boxes.read();
          const pr = await Voice.judge(r.blob, w, 'loose');
          const letterOk = read.text === w;
          if (!pr.pass) {
            $('#msg').innerHTML = '<span class="ng">声が 聞こえなかったか、単語が 聞き取れなかったぞ。</span><br>唱えながら 書くのが ルールじゃ！ もう一度。';
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: false, letterOk });
            await sleep(1800); return showWord(rep);
          }
          if (!hidden) {
            const learned = boxes.learnFrom(w);
            $('#msg').innerHTML = `<span class="ok">⭕ OK！</span> ${letterOk ? 'きれいに きざめたぞ。' : `（石版には「${esc(read.text)}」と 読めた。ていねいに 書こう）`}`;
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: true, letterOk, learned });
          } else if (!letterOk) {
            $('#msg').innerHTML = `<span class="ng">❌ 石版には「${esc(read.text || '（空）')}」と 読めた。</span><br>正しくは <b>${esc(w)}</b>。もう一度！`;
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: true, letterOk: false, read: read.text });
            await sleep(2500); return showWord(rep);
          } else {
            $('#msg').innerHTML = '<span class="ok">⭕ 完ぺき！</span> 見ないで きざめたな！';
            API.record({ type: 'write', lesson: L.n, word: w, rep, pronOk: true, letterOk: true });
          }
          await sleep(900);
          if (rep < REPS) showWord(rep + 1); else { i++; showWord(1); }
        } catch (e) { $('#msg').textContent = e.message; busy = false; $('#done').disabled = false; }
      };
    };
    showWord(1);
  }

  // ===== 書きのテストの共通部分（レッスンの試練・抜き打ちテスト・最終試験） =====
  // opt：{ words, top(i, n, results)：上に出すHTML, lead(i, n)：説明, footer(results)：下の吹き出し,
  //        reveal：'answer'（正解を見せる）/'mark'（○×だけ）, record(word, ok, read, timeout, left), onHit(ok), done(results) }
  function writingTest(opt) {
    const maxLen = Math.max(...opt.words.map((w) => w.length));
    const boxCount = Math.min(14, maxLen + 2); // 文字数が分からないよう、マスは多めに
    const results = [];
    let qi = 0;
    const ask = () => {
      if (qi >= opt.words.length) return opt.done(results);
      const w = opt.words[qi], limit = 15 + 3 * w.length;
      let left = limit, done = false, wentAway = false;
      main().innerHTML = opt.top(qi, opt.words.length, results) + `
        <section class="parch" style="text-align:center">
          <p class="small muted" style="font-weight:700">${opt.lead(qi, opt.words.length)}</p>
          <p class="meaning big">${esc(S.words[w].meaning)}</p>
          <div class="fuse">⏳<span class="line"><div id="tb"></div></span><span id="sec">のこり ${limit}秒</span></div>
          <div id="boxes"></div>
          <div class="row"><button class="btn small" id="undo">↩︎ 1画もどす</button><button class="btn small" id="clr">🧽 全部消す</button></div>
          <p class="small muted">使わない マスは 空けておこう。</p>
          <button class="gbtn" id="ans">⚔️ きざむ（答える）</button>
        </section>
        <div class="rpg" id="res">${opt.footer(results)}<span class="tri">▼</span></div>`;
      bindHeader();
      const boxes = new HW.Boxes($('#boxes'), { count: boxCount, prefilled: w[0] });
      const away = () => { if (document.hidden && !done) wentAway = true; };
      document.addEventListener('visibilitychange', away);
      const timer = setInterval(() => {
        left -= 0.25;
        const tb = $('#tb'); if (tb) { tb.style.width = Math.max(0, left / limit * 100) + '%'; tb.className = left < 5 ? 'low' : ''; }
        const sc = $('#sec'); if (sc) sc.textContent = `のこり ${Math.max(0, Math.ceil(left))}秒`;
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
        results.push({ w, word: w, ok });
        opt.record(w, ok, read.text, !!timeout, wentAway);
        if (opt.onHit) opt.onHit(ok, results);
        $('#ans').disabled = true;
        const why = timeout ? '（時間切れ）' : wentAway ? '（テスト中に 画面を はなれたため 不正解）' : '';
        $('#res').innerHTML = opt.reveal === 'mark'
          ? (ok ? '<span class="fb ok">⭕ 正解！</span>' : `<span class="fb ng">❌ 不正解</span>${why}`)
          : (ok ? `<span class="fb ok">⭕ 正解！</span> <b style="font-family:var(--en)">${esc(w)}</b>`
            : `<span class="fb ng">❌ 正解は <b style="font-family:var(--en)">${esc(w)}</b></span>${why || `<br><span class="small">石版には「${esc(read.text)}」と 読めた</span>`}`);
        await sleep(ok ? 1200 : opt.reveal === 'mark' ? 1500 : 2600);
        qi++; ask();
      };
      $('#ans').onclick = () => finish(false);
    };
    ask();
  }

  // ===== ステップ4：試練（書きのテスト） =====
  function stepTest(L, words, st, next) {
    setScene('night');
    // st.test = { round, list, wrong, unlockAt }
    if (!st.test) { st.test = { round: 1, list: shuffle(words) }; saveState(st); }
    const T = st.test;
    if (T.unlockAt) return waitRetest(L, words, st, next); // 待ち時間中・待ち終わり（再開したとき）は、まず待ち画面を出す
    writingTest({
      words: T.list,
      top: (i, n) => lessonHeader(L, 4, i, n),
      lead: (i, n) => (T.round === 1 ? `試練 ${i + 1} / ${n} ｜ 意味に合う ことばを 石版に きざめ（最初の文字は きざんである）` : `再試練（${T.round}回目）：全問 正解で 突破！`),
      footer: (r) => `▶ ここまで ${r.filter((x) => x.ok).length} / ${r.length} 正解。合格は 8割以上じゃ。<br><span class="small">テスト中に 画面を はなれると 不正解に なるぞ。</span>`,
      reveal: 'answer',
      record: (w, ok, read, timeout, left) => API.record({ type: 'test', lesson: L.n, word: w, correct: ok, read, timeout, left, round: T.round }),
      done: (results) => grade(results),
    });
    const grade = (results) => {
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
  }
  function waitRetest(L, words, st, next) {
    setScene('night');
    const T = st.test;
    const tick = () => {
      const ms = T.unlockAt - Date.now();
      const el = $('#cd');
      if (ms <= 0) { clearInterval(t); if (el) { el.textContent = '再試練 できるぞ！'; $('#rt').disabled = false; } return; }
      if (el) el.textContent = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    };
    main().innerHTML = lessonHeader(L, 4) + `
      <div class="two">
        <section class="parch" style="text-align:center">
          <p style="font-size:48px;margin:0">📖</p><h2 style="font-family:var(--title)">おしい！ ${esc(T.last || '')}</h2>
          <p>合格は 8割以上。まちがえた ことばだけで、<b>5分後</b>に 再試練じゃ（全問 正解で 突破）。</p>
          <p class="countdown" id="cd"></p>
          <button class="gbtn" id="rt" disabled>⚔️ 再試練を はじめる</button>
        </section>
        <section class="parch">
          <p class="small muted" style="font-weight:700;text-align:center">待っている間に、声に出して、紙に書いて 覚えよう</p>
          <div class="review">${T.list.map((w) => `<div class="rv"><b>${esc(w)}</b><span>${esc(S.words[w].meaning)}</span><button class="btn small" data-say="${esc(w)}">🔊</button></div>`).join('')}</div>
        </section>
      </div>`;
    bindHeader();
    main().querySelectorAll('[data-say]').forEach((b) => b.onclick = () => { Rec.audioCtx(); Voice.speak(b.dataset.say); });
    const t = setInterval(tick, 500); tick();
    cleanups.push(() => clearInterval(t));
    $('#rt').onclick = () => { delete T.unlockAt; saveState(st); stepTest(L, words, st, next); };
  }


  // =====================================================================
  // 抜き打ちテスト（ワードモンスター）
  // =====================================================================
  async function showPop(force) {
    stopAll(); showLoading('…なにかの けはいが する…');
    let j;
    try { j = await API.call('popStart', { force: !!force }); } catch (e) { return showError(e.message); }
    if (!j.ok) { U.toast(j.error); return showHome(); }
    S.progress = j.progress;
    if (j.remedial) return remedialIntro(j.remedial.words);
    popWarning(j.quiz, j.restarted);
  }
  function popWarning(quiz, restarted) {
    stopAll(); setScene('alarm');
    main().innerHTML = `<div class="alarm" id="alarm">
      <div class="stripe s1"></div><div class="stripe s2"></div>
      <div class="warn"><div class="w">⚠ WARNING ⚠</div><div class="s">ワードモンスターの けはい…！</div></div>
      <div class="silh">🐉</div></div>`;
    let gone = false;
    const go = () => { if (gone) return; gone = true; popBoss(quiz, restarted, false); };
    $('#alarm').onclick = go;
    const t = setTimeout(go, 2600); cleanups.push(() => clearTimeout(t));
  }
  function bossIntro({ emoji, name, lines, startLabel, note, again }) {
    return new Promise((res) => {
      stopAll(); setScene('boss');
      main().innerHTML = `<div class="boss-in">
        <div class="aura"><span>${emoji}</span></div>
        <div class="bossname">${esc(name)} が あらわれた！</div>
        ${again ? `<p class="notice">${again}</p>` : ''}
        <div class="rpg">${lines}<span class="tri">▼</span></div>
        <div class="cmd"><button class="gbtn" id="fight">${startLabel}</button><div class="flee">🏃 にげる<small>にげられない！</small></div></div>
        <p class="small center-t" style="color:#e8d0ff">${note}</p></div>`;
      $('#fight').onclick = res;
    });
  }
  async function popBoss(quiz, restarted, rematch) {
    const n = quiz.words.length;
    await bossIntro({
      emoji: '🐉', name: rematch ? '忘却のドラゴン（再戦）' : '忘却のドラゴン',
      lines: `これまでに 取りもどした ことばで たたかえ！<br>⚔️ 出題：${n}問 ／ 🛡️ 撃退ライン：${quiz.pass}問 正解`,
      startLabel: '⚔️ たたかう',
      note: 'たたかいを 始めたら、途中で やめても 次は 問題が 入れかわって 最初から やり直しじゃ。',
      again: restarted ? '前回 途中で にげたので、問題が 入れかわった！' : '',
    });
    API.call('popBegin', { id: quiz.id }).catch(() => {});
    battle({
      quiz, emoji: '🐉', name: '忘却のドラゴン', reveal: 'answer', type: 'popAns',
      done: (results) => submitPop(quiz, results),
    });
  }
  // 戦闘画面（抜き打ち・最終試験で共通）
  function battle({ quiz, emoji, name, reveal, type, done }) {
    setScene('boss');
    const n = quiz.words.length, need = quiz.pass;
    writingTest({
      words: quiz.words,
      top: (i, _n, r) => {
        const right = r.filter((x) => x.ok).length;
        const hp = Math.max(0, (need - right) / need * 100);
        return `<div class="bossmini" id="bossmini"><div class="nm">${esc(name)}</div><span class="be">${emoji}</span><div class="hit" id="hit">HIT!</div>
            <div class="bar hp"><div style="width:${hp}%"></div></div></div>
          <div class="score">${quiz.words.map((_, k) => `<span class="${k < r.length ? (r[k].ok ? 'o' : 'x') : k === i ? 'now' : 'e'}">${k + 1}</span>`).join('')}</div>`;
      },
      lead: (i, nn) => `第 ${i + 1} 問 / ${nn} ─ ${esc(name)}の 弱点を つけ！（最初の文字は きざんである）`,
      footer: (r) => { const right = r.filter((x) => x.ok).length; return `▶ ${right} / ${r.length} 正解。撃退まで あと <b>${Math.max(0, need - right)}</b>問 正解じゃ！<br><span class="small">テスト中に 画面を はなれると 不正解に なるぞ。</span>`; },
      reveal,
      record: (w, ok, read, timeout, left) => API.record({ type, word: w, correct: ok, read, timeout, left }),
      onHit: (ok) => { const b = $('#bossmini'); if (b && ok) b.classList.add('hitnow'); },
      done,
    });
  }
  async function submitResults(action, payload) {
    for (;;) {
      showLoading('けっかを 記録しています…');
      try { await API.flush(); const j = await API.call(action, payload); return j; }
      catch (e) {
        await new Promise((res) => {
          main().innerHTML = `<div class="loading"><div class="parch" style="max-width:560px;margin:0 auto;font-family:var(--body)"><p>${esc(e.message)}</p><p class="small">けっかは まだ 送れていません。電波のよい場所で、もう一度 送ってください。</p><button class="gbtn" id="resend">もう一度 送る</button></div></div>`;
          $('#resend').onclick = res;
        });
      }
    }
  }
  async function submitPop(quiz, results) {
    const j = await submitResults('popSubmit', { id: quiz.id, results: results.map((r) => ({ word: r.word, ok: r.ok })) });
    if (!j.ok) { U.toast(j.error); S.progress = j.progress || S.progress; return showHome(); }
    S.progress = j.progress;
    if (j.pass) return victory({ title: '撃退成功！', icon: '🎁', rows: [
      ['🐉', `忘却のドラゴンを 撃退した（${j.right} / ${j.n} 正解）`],
      ['🛡️', `これまでに 撃退した回数：${popWins()}回`],
      ['🗡️', '取りもどした ことばは しっかり 身についている！'],
    ], talk: 'ドラゴンは 逃げていった…。でも また 別の モンスターが 来るかもしれん。ゆだんするでないぞ！' });
    stopAll(); setScene('boss');
    main().innerHTML = `<div class="celebrate">
      <h1 style="color:#d9d4ff;text-shadow:0 6px 0 #2a2060,0 0 24px #8a7aff">押し返された…</h1>
      <p class="big" style="filter:drop-shadow(0 0 30px rgba(200,120,255,.8))">🐉</p>
      <p style="font-family:var(--pop);font-size:22px">正解 ${j.right} / ${j.n}（撃退ライン ${quiz.pass}）</p>
      <section class="parch"><h2 style="font-family:var(--title);text-align:center">📖 修行して 再戦せよ！</h2>
        <div class="rw"><span class="ic">📝</span>まちがえた ${j.wrong.length}語で、レッスンの 4ステップを もう一度</div>
        <div class="rw"><span class="ic">🔁</span>修行が 終わったら、ドラゴンと 再戦（問題は 一部 入れかわる）</div>
        <div class="rw"><span class="ic">🔒</span>撃退するまで、次の レッスンには 進めない</div>
        <div class="review" style="margin-top:10px">${j.wrong.map((w) => `<div class="rv"><b>${esc(w)}</b><span>${esc(S.words[w] ? S.words[w].meaning : '')}</span><span></span></div>`).join('')}</div></section>
      ${owl('まちがえた ことばこそ、強くなる チャンスじゃ。さあ、修行の書を ひらくのじゃ！')}
      <button class="gbtn" id="rem">📖 修行を はじめる</button></div>`;
    $('#rem').onclick = () => openRemedial(j.wrong);
  }
  function popWins() { return ((S.progress.pop && S.progress.pop.history) || []).filter((h) => h.pass).length; }
  function remedialIntro(words) {
    const st = loadState();
    if (st && st.n === 'R' && st.step > 1) return openRemedial(words); // 途中から再開
    stopAll(); setScene('night');
    main().innerHTML = `<div class="celebrate"><p class="big">📖</p><h1 style="font-size:44px">修行の書</h1>
      <section class="parch"><p>抜き打ちテストで まちがえた <b>${words.length}語</b>で、レッスンの 4ステップを やり直すのじゃ。終わったら、ドラゴンと 再戦！</p>
      <div class="review">${words.map((w) => `<div class="rv"><b>${esc(w)}</b><span>${esc(S.words[w] ? S.words[w].meaning : '')}</span><span></span></div>`).join('')}</div></section>
      <button class="gbtn" id="rem">📖 修行を はじめる</button>
      <button class="btn" id="later">村へ もどる</button></div>`;
    $('#rem').onclick = () => openRemedial(words);
    $('#later').onclick = showHome;
  }
  function openRemedial(words) {
    const L = { n: 0, kind: 'remedial', words: words.filter((w) => S.words[w]), review: [] };
    let st = loadState();
    if (!st || st.n !== 'R') { st = { n: 'R', step: 1 }; saveState(st); }
    startClock(0);
    runStep(L, L.words, st);
  }
  async function remedialDone() {
    clearState(); stopAll();
    showLoading('ドラゴンが もどってきた…');
    let j;
    try { j = await API.call('popRemedialDone'); } catch (e) { return showError(e.message); }
    if (!j.ok) { U.toast(j.error); return showHome(); }
    S.progress = j.progress;
    popBoss(j.quiz, false, true);
  }

  // =====================================================================
  // 最終試験（忘却の魔王）
  // =====================================================================
  async function showFinal() {
    stopAll(); showLoading('魔王城の 門が ひらく…');
    let j;
    try { j = await API.call('finalStart'); } catch (e) { return showError(e.message); }
    if (j.progress) S.progress = j.progress;
    if (!j.ok) {
      if (j.code === 'final-wait' || j.code === 'final-max') return finalWait(j);
      U.toast(j.error); return showHome();
    }
    const ex = j.exam, F = S.progress.final;
    await bossIntro({
      emoji: '👿', name: '忘却の魔王',
      lines: `王国の すべての ことばで たたかえ！<br>⚔️ 出題：${ex.words.length}問（全部の単語から） ／ 🛡️ 合格：${ex.pass}問 正解<br>🔁 挑戦：${ex.attempt}回目（最大 ${F.max}回）`,
      startLabel: '⚔️ 最終決戦に いどむ',
      note: '試験を 始めたら、途中で やめると 不合格（1回分）に なるぞ。答えは 試験が 終わるまで 明かされない。',
    });
    API.call('finalBegin', { id: ex.id }).catch(() => {});
    battle({ quiz: ex, emoji: '👿', name: '忘却の魔王', reveal: 'mark', type: 'finalAns', done: (r) => submitFinal(ex, r) });
  }
  async function submitFinal(ex, results) {
    const j = await submitResults('finalSubmit', { id: ex.id, results: results.map((r) => ({ word: r.word, ok: r.ok })) });
    if (!j.ok) { U.toast(j.error); S.progress = j.progress || S.progress; return showHome(); }
    S.progress = j.progress;
    if (j.pass) return victory({ title: '王国を 救った！', icon: '👑', rows: [
      ['👿', `忘却の魔王を たおした（${j.right} / ${j.n} 正解）`],
      ['🗡️', `取りもどした ことば：${S.list.length}語 すべて`],
      ['🏅', '冬休みクエスト クリア！'],
    ], talk: 'ホッホー！ ついに やりとげたな。きみこそ ことばの王国の 英雄じゃ！ 2周目で さらに みがきを かけるのも よいぞ。' });
    finalWait({ code: j.left > 0 ? 'final-wait' : 'final-max', waitMs: S.progress.final.waitMs, justFailed: { right: j.right, n: j.n, pass: ex.pass, missed: results.filter((r) => !r.ok).map((r) => r.word) } });
  }
  function finalWait(info) {
    stopAll(); setScene('boss');
    const F = S.progress.final, left = Math.max(0, F.max - F.tries);
    const until = F.lastFailAt + F.waitMs;
    const jf = info.justFailed;
    main().innerHTML = `<div class="celebrate">
      <h1 style="color:#d9d4ff;text-shadow:0 6px 0 #2a2060,0 0 24px #8a7aff;font-size:clamp(40px,7vw,64px)">${info.code === 'final-max' ? '力つきた…' : '魔王に はね返された…'}</h1>
      <p class="big" style="filter:drop-shadow(0 0 30px rgba(200,120,255,.8))">👿</p>
      ${jf ? `<p style="font-family:var(--pop);font-size:22px">正解 ${jf.right} / ${jf.n}（合格 ${jf.pass}）</p>` : ''}
      <section class="parch">
        ${info.code === 'final-max'
          ? `<h2 style="font-family:var(--title);text-align:center">挑戦できる回数（${F.max}回）を 使い切った</h2><p>冬休み明けに、<b>居残りで 再挑戦</b>じゃ。それまでに、まちがえた ことばを 復習しておこう。</p>`
          : `<h2 style="font-family:var(--title);text-align:center">修行して 再挑戦せよ！</h2>
             <p class="countdown" id="cd"></p>
             <p class="center-t">のこりの 挑戦：<b>${left}回</b>（最大 ${F.max}回）。次は、まちがえた ことばは また出て、正解した ことばは 入れかわる。</p>`}
        ${jf && jf.missed.length ? `<p class="small muted" style="font-weight:700;margin-top:10px">まちがえた ことばの 意味（答えは 自分で 単語帳を 調べよう）</p>
          <div class="review">${jf.missed.map((w) => `<div class="rv"><span>${esc(S.words[w] ? S.words[w].meaning : '')}</span><b>${esc(w[0])}……</b><span></span></div>`).join('')}</div>` : ''}
      </section>
      ${info.code === 'final-max' ? '' : '<button class="gbtn" id="again" disabled>⚔️ 再挑戦する</button>'}
      <button class="btn" id="later">村へ もどる</button></div>`;
    $('#later').onclick = showHome;
    if (info.code !== 'final-max') {
      const tick = () => {
        const ms = until - Date.now(), el = $('#cd');
        if (ms <= 0) { clearInterval(t); if (el) el.textContent = '再挑戦 できるぞ！'; const a = $('#again'); if (a) a.disabled = false; return; }
        if (el) el.textContent = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
      };
      const t = setInterval(tick, 500); tick(); cleanups.push(() => clearInterval(t));
      $('#again').onclick = showFinal;
    }
  }
  // 勝利の画面（抜き打ち撃退・最終試験合格）
  function victory({ title, icon, rows, talk }) {
    stopAll(); setScene('victory');
    document.body.insertAdjacentHTML('beforeend', '<div class="rays"></div>');
    main().innerHTML = `<div class="celebrate"><h1>${esc(title)}</h1><p class="big">${icon}</p>
      <section class="parch"><h2 style="font-family:var(--title);text-align:center;margin-bottom:6px">✨ 戦利品 ✨</h2>
      ${rows.map(([ic, t]) => `<div class="rw"><span class="ic">${ic}</span>${t}</div>`).join('')}</section>
      ${owl(talk)}
      <button class="gbtn" id="home">🏘️ 村へ もどる</button></div>`;
    $('#home').onclick = showHome;
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
    setScene('victory');
    document.body.insertAdjacentHTML('beforeend', '<div class="rays"></div>');
    main().innerHTML = `<div class="celebrate">
      <h1>レッスン${L.n} 攻略！</h1>
      <p class="big">🎁</p>
      <section class="parch">
        <h2 style="font-family:var(--title);text-align:center;margin-bottom:6px">✨ 戦利品 ✨</h2>
        <div class="rw"><span class="ic">🗡️</span>${words.length}の ことばを 取りもどした（合計 ${learnedWords()}語）</div>
        <div class="rw"><span class="ic">⚔️</span>書きの試練：${esc(st.testScore || '')}${st.testRounds > 1 ? `（再試練 ${st.testRounds - 1}回で 突破）` : ''}</div>
        <div class="rw"><span class="ic">🔥</span>連続 ${streak()}日 冒険中</div>
      </section>
      <button class="gbtn" id="home">🏘️ 村へ もどる</button></div>`;
    $('#home').onclick = showHome;
  }

  return { start, onProgress };
})();
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.start());
