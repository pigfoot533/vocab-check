// お手本の音声・録音・発音判定のまとめ役
// ・お手本：試作品では端末の読み上げ機能を使う（本番では事前に作った音声ファイルに差しかえる）
// ・録音と判定：発音判定キット（Rec・Pron・PronJudge）を使い、すべて端末の中で処理する
const Voice = (() => {
  let voice = null;
  function pickVoice() {
    const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    // 男性のアメリカ英語の声を優先
    voice = vs.find((v) => /en[-_]US/i.test(v.lang) && /(Alex|Aaron|Fred|Daniel|Male|Tom|Evan|Nathan)/i.test(v.name))
      || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', pickVoice); }

  // お手本を読む（終わったら解決する）。必ずボタン操作の中から呼ぶ
  function speak(text, rate = 0.9) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(false); return; }
      try { speechSynthesis.cancel(); } catch { /* なし */ }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = rate; if (voice) u.voice = voice;
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(true); } };
      u.onend = fin; u.onerror = fin;
      setTimeout(fin, 900 + text.length * 180 / rate); // 終わりの合図が来ない端末への備え
      speechSynthesis.speak(u);
    });
  }

  // 録音する。声が出て、そのあと静かになったら自動で止める（最大 maxMs）
  // onLevel(v)：音量（0〜1）
  async function listen({ maxMs = 3500, onLevel, onStart, minVoiceMs = 150, silenceMs = 700 } = {}) {
    let heard = 0, quietSince = 0, lastT = Date.now(), resolveAuto;
    const levels = []; // 周りの音の大きさ（ざわざわしていても、声が終わったら止まるように）
    const auto = new Promise((r) => { resolveAuto = r; });
    const rec = await Rec.start({
      maxMs,
      onAutoStop: (r) => resolveAuto(r),
      onLevel: (v) => {
        const now = Date.now(), dt = now - lastT; lastT = now;
        if (onLevel) onLevel(v);
        levels.push(v); if (levels.length > 300) levels.shift();
        const floor = levels.length >= 10 ? levels.slice().sort((a, b) => a - b)[Math.floor(levels.length * 0.2)] : 0; // 小さい方から2割の音＝周りの音
        const thr = Math.max(0.18, floor * 2 + 0.06);
        if (v > thr) { heard += dt; quietSince = 0; }
        else if (heard > minVoiceMs) { if (!quietSince) quietSince = now; else if (now - quietSince > silenceMs) resolveAuto(null); }
      },
    });
    if (onStart) onStart(); // マイクの準備ができ、録音が始まった（ここで「どうぞ」を出す）
    const r = await auto;
    const result = r || await rec.stop();
    result.heardMs = heard;
    return result;
  }

  // ===== 録音の中から、いちばん大きな音（＝iPadの近くで話している生徒の声）だけを取り出す =====
  // 周りの話し声やテレビの音は、iPadの目の前で話す声より小さいので、判定の前に取りのぞく。
  // ただし、机をたたく音のような「短すぎる大きな音」は声ではないので、次に大きい音を選ぶ。
  const FOCUS = { frame: 320, minVoice: 0.12, gap: 0.35, pad: 0.2, extend: 0.5, quiet: 0.03 }; // 秒（16kHz で 320＝20ミリ秒）
  function focusLoudest(pcm, sr = 16000) {
    const F = FOCUS.frame, n = Math.floor(pcm.length / F);
    if (n < 10) return { pcm, focused: false };
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) { let e = 0; for (let k = i * F; k < (i + 1) * F; k++) e += pcm[k] * pcm[k]; raw[i] = Math.sqrt(e / F); }
    // ペンが画面に当たる音のような「一瞬だけの音」をならす（前後5コマ＝100ミリ秒のまん中の値）。声は続くので残る
    const rms = new Float32Array(n);
    for (let i = 0; i < n; i++) { const w = []; for (let k = i - 2; k <= i + 2; k++) w.push(raw[Math.min(n - 1, Math.max(0, k))]); w.sort((a, b) => a - b); rms[i] = w[2]; }
    const sorted = Array.from(rms).sort((a, b) => a - b);
    const noise = sorted[Math.floor(n * 0.2)];   // 静かなところの音（小さい方から2割）
    const middle = sorted[Math.floor(n * 0.5)];  // ずっと鳴っている音（テレビなど）があると、ここが大きくなる
    const peak = sorted[n - 1];
    if (peak < noise * 2 || peak < 0.003) return { pcm, focused: false }; // 声らしい大きな音がない
    if (noise < peak * FOCUS.quiet && middle < peak * 0.1) return { pcm, focused: false, quiet: true }; // 静かな部屋：切り取らない（単語の端を欠けさせないため）
    // 声の中心を探す基準：周りの音よりはっきり大きい音（ただし、いちばん大きな音の35%より厳しくはしない）
    const core = Math.min(peak * 0.35, Math.max(peak * 0.12, noise * 3, middle * 2));
    const low = Math.max(peak * 0.05, noise * 3); // 声の端（弱い子音・息の音など）を拾う基準
    const gapF = Math.round(FOCUS.gap * sr / F), segs = [];
    let cur = null, quiet = 0;
    for (let i = 0; i < n; i++) {
      if (rms[i] >= core) { if (!cur) cur = { a: i, b: i, peak: 0 }; cur.b = i; quiet = 0; cur.peak = Math.max(cur.peak, rms[i]); }
      else if (cur && ++quiet > gapF) { segs.push(cur); cur = null; quiet = 0; }
    }
    if (cur) segs.push(cur);
    const minF = Math.round(FOCUS.minVoice * sr / F);
    const voiced = segs.filter((g) => g.b - g.a + 1 >= minF);   // 短すぎる大きな音（物音）は除く
    const pick = (voiced.length ? voiced : segs).sort((x, y) => y.peak - x.peak)[0];
    if (!pick) return { pcm, focused: false };
    // 端を少し広げる（弱い子音など。広げすぎないよう上限あり）
    const extF = Math.round(FOCUS.extend * sr / F);
    let a = pick.a, b = pick.b;
    for (let k = 0; k < extF && a > 0 && rms[a - 1] >= low; k++) a--;
    for (let k = 0; k < extF && b < n - 1 && rms[b + 1] >= low; k++) b++;
    const padF = Math.round(FOCUS.pad * sr / F);
    const s0 = Math.max(0, a - padF) * F, s1 = Math.min(n, b + 1 + padF) * F;
    return { pcm: pcm.slice(s0, s1), focused: true, from: s0 / sr, to: s1 / sr, segments: segs.length };
  }

  // 単語の「正しい音素の並び」（キットの使い方どおり）
  const jwCache = {};
  async function wordInfo(word) {
    if (jwCache[word]) return jwCache[word];
    const a = await Pron.analyze(word);
    if (!a || !a.phon || !a.phon.phones.length) return null;
    const alts = await Pron.prons(word.toLowerCase());
    jwCache[word] = { word, ipa: a.ipa, syllables: a.syllables, stress: a.stress, phon: { ...a.phon, alts: (alts || []).map((s) => String(s).trim().split(/\s+/)) } };
    return jwCache[word];
  }

  // ===== 合格の基準（実際の生徒の声で調整するときは、ここだけ直す） =====
  // gop：その音が「正しい音」にどれだけ当てはまるか（キットの値。正しい発音はおよそ -1 以上、別の音に聞こえると -7 前後）
  const RULE = {
    // 基本：単語として聞き取れるか。はっきり別の音・抜けた音（gop が bad より下）が、この割合までなら合格
    // （10月29日 1回目：厳しすぎ → -8・1/2 に緩めた。2回目：緩すぎ → その中間の -7・0.4 にした）
    badRatio: { strict: 0.4, loose: 0.55 },
    bad: -7,
    // 「AIがほとんど聞き取れなかった」（ぼそぼそ・別のことば）は不合格
    lowSignalFails: true,
    // AIが自由に聞き取った音と、正しい音の並びが、この割合以上そろっていること（近い音はそろったとみなす）
    matchMin: 0.5,
    // 子音（単語らしさを決める音）が、少なくともこの割合は聞き取れていること
    consMin: 0.34,
    // 少し厳しく見る音の組：この音に聞こえて、かつ gop がこの値より下なら不合格
    pairs: { R: 'L', L: 'R', B: 'V', V: 'B' },
    pairLimit: -3.5,
    // 余分な母音（book →「ブック」の「ク」の母音など）：キットが見つけたら不合格
    insertFails: false, // 2026年10月29日：判定しないことにした
  };
  // 「設定」シートの値で上書きする（先生があとから調整できるように）
  function configure(c) {
    if (!c) return;
    if (isFinite(c.pronBad)) RULE.bad = Number(c.pronBad);
    if (isFinite(c.pronRatio) && c.pronRatio > 0) { RULE.badRatio.strict = Number(c.pronRatio); RULE.badRatio.loose = Math.min(1, Number(c.pronRatio) + 1 / 6); }
    if (isFinite(c.pronPairLimit)) RULE.pairLimit = Number(c.pronPairLimit);
    if (typeof c.pronPairs === 'boolean') RULE.pairs = c.pronPairs ? { R: 'L', L: 'R', B: 'V', V: 'B' } : {};
    if (typeof c.pronInsert === 'boolean') RULE.insertFails = c.pronInsert;
    if (isFinite(c.pronMatch) && c.pronMatch !== null) RULE.matchMin = Number(c.pronMatch);
    if (typeof c.pronLowSignal === 'boolean') RULE.lowSignalFails = c.pronLowSignal;
  }
  const KANA = { UW: 'ウ', UH: 'ウ', AH: 'ア', OW: 'オ', IH: 'イ', IY: 'イ' };

  // 近い音（そろったとみなす組）。r と l、b と v は入れない（区別して見る）
  const NEAR = [['S', 'Z', 'TH'], ['Z', 'DH'], ['T', 'D', 'DH'], ['CH', 'T'], ['JH', 'D'], ['K', 'G'], ['P', 'B'], ['F', 'HH'], ['SH', 'ZH', 'CH', 'JH'], ['M', 'N', 'NG'], ['W', 'UW'], ['Y', 'IY'],
    ['IY', 'IH', 'EY'], ['EH', 'AE', 'AH', 'EY'], ['AA', 'AO', 'AH', 'OW'], ['UW', 'UH', 'OW'], ['ER', 'AH', 'R', 'AA'], ['AA', 'OW', 'AO'], ['AY', 'AA', 'AE'], ['AW', 'AA', 'OW'], ['OY', 'AO']];
  const VOWEL = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
  // そろい方の点：同じ音・近い音は1点。近くない母音どうしは0.5点（日本語なまりの母音の違いで落としすぎないため）
  const nearScore = (a, b) => (a === b || NEAR.some((g) => g.includes(a) && g.includes(b)) ? 1 : (VOWEL.has(a) && VOWEL.has(b) ? 0.5 : 0));
  // AIが聞き取った音の並び（heard）と、正しい音の並び（target）が、どれだけ同じ順番でそろっているか（0〜1）
  function matchRate(target, heard) {
    if (!target.length) return 1;
    if (!heard || !heard.length) return 0;
    const m = target.length, n = heard.length, dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { const sc = nearScore(target[i - 1], heard[j - 1]); dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], sc ? dp[i - 1][j - 1] + sc : 0); }
    return dp[m][n] / m;
  }

  // 判定結果 res から合否を決める（画面に依存しない計算だけの部分）
  // mode：'strict'（発音ステップ）、'loose'（書く練習：単語として聞き取れれば合格。音の組・余分な母音は見ない）
  function decide(res, mode) {
    if (!res || res.silent || res.tooShort) return { pass: false, reason: 'silent' };
    const ph = res.phones || [];
    const n = ph.length;
    const reasons = [];
    // ① 単語として聞き取れるか
    const badN = ph.filter((p) => p.gop < RULE.bad).length;
    const allow = n <= 1 ? 0 : Math.max(1, Math.floor(n * RULE.badRatio[mode === 'loose' ? 'loose' : 'strict']));
    const rate = res.heard ? matchRate(ph.map((p) => p.ph), res.heard) : 1;
    const tc = ph.map((p) => p.ph).filter((x) => !VOWEL.has(x)), hc = (res.heard || []).filter((x) => !VOWEL.has(x));
    const cons = res.heard && tc.length ? matchRate(tc, hc) : 1;
    const low = !!res.lowSignal && (RULE.lowSignalFails || badN > 0) && rate < Math.min(1, RULE.matchMin + 0.2); // 聞き取れた音が少なく、そろってもいないとき
    if (badN > allow || low || rate < RULE.matchMin || cons < RULE.consMin) reasons.push({ type: 'word' });
    if (mode !== 'loose') {
      // ② r と l、b と v
      ph.forEach((p, i) => {
        const other = RULE.pairs[p.ph];
        if (other && p.heard === other && p.gop < RULE.pairLimit) reasons.push({ type: 'pair', i, ph: p.ph, heard: other });
      });
      // ③ 余分な母音
      if (RULE.insertFails) (res.insertions || []).forEach((x) => reasons.push({ type: 'insert', after: x.after, vowel: x.vowel }));
    }
    return { pass: reasons.length === 0, reasons, badN, allow, rate: Math.round(rate * 100) / 100, cons: Math.round(cons * 100) / 100, low, heard: (res.heard || []).join(' ') };
  }

  // 不合格の理由を、生徒向けの短い言葉にする
  function advice(d, jw) {
    if (d.pass) return '';
    if (d.reason === 'silent') return '声が聞こえなかったよ。マイクに近づいて、はっきり言おう。';
    const phs = (jw && jw.phon && jw.phon.phones) || [];
    const msgs = [];
    d.reasons.forEach((r) => {
      if (r.type === 'word') msgs.push('単語として聞き取れなかったよ。お手本をよく聞いて、もう一度。');
      if (r.type === 'pair') {
        const tips = {
          R: 'r が l に聞こえたよ。舌先をどこにも付けず、少し奥に引いて言おう。',
          L: 'l が r に聞こえたよ。舌先を上の前歯の裏にしっかり付けて言おう。',
          B: 'b が v に聞こえたよ。上下の唇をしっかり閉じてから、パッと開こう。',
          V: 'v が b に聞こえたよ。上の前歯を下唇に軽く当てて、声を出そう。',
        };
        msgs.push(tips[r.ph]);
      }
      if (r.type === 'insert') {
        const after = String(phs[r.after] || '').replace(/\d/g, '').toLowerCase();
        msgs.push(`「${after}」のあとに、よけいな「${KANA[r.vowel] || 'ウ'}」が入ったよ。子音で止めよう。`);
      }
    });
    return [...new Set(msgs)].join('<br>');
  }

  // =====================================================================
  // 評価の分類とフィードバック（専門家の評価方針をもとに、このアプリ向けに調整）
  //  ・意味が変わる取りちがえ（r と l、b と v）と「単語として聞き取れない」→ 不合格（block）
  //  ・余分な母音、強く読む位置、s と sh・f と h・長い／短い母音、語末の子音の脱落 → 助言だけ（advise）
  //  ・日本語なまりの許容できる揺れ（th の代用、暗い L、母音の質の違い など）→ 気にしなくてよい（info）
  //
  // 型（JSDoc）：
  //  @typedef {'block'|'advise'|'info'} Level
  //  @typedef {'phonemic'|'prosodic'|'variation'|'intelligibility'} Kind
  //  @typedef {{ code:string, level:Level, kind:Kind, at?:number, ph?:string, heard?:string, msg:string }} Finding
  //  @typedef {{ pass:boolean, score:number, findings:Finding[] }} Assessment
  // =====================================================================
  const IPA2 = { AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', F: 'f', G: 'ɡ', HH: 'h', IH: 'ɪ', IY: 'i', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', OW: 'oʊ', OY: 'ɔɪ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', UH: 'ʊ', UW: 'u', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ' };
  const ipa = (p) => '/' + (IPA2[p] || String(p).toLowerCase()) + '/';
  // 助言する取りちがえ（意味の区別に関わるが、このアプリでは合否に使わない）
  const CONTRAST = { 'S>SH': 'S_SH', 'SH>S': 'S_SH', 'F>HH': 'F_H', 'HH>F': 'F_H', 'IY>IH': 'TENSE', 'IH>IY': 'TENSE', 'UW>UH': 'TENSE', 'UH>UW': 'TENSE' };
  // 気にしなくてよい揺れ
  const VARIATION = { 'TH>S': 'TH', 'TH>T': 'TH', 'TH>F': 'TH', 'DH>Z': 'TH', 'DH>D': 'TH', 'CH>T': 'CH', 'JH>D': 'CH', 'W>UW': 'W', 'T>D': 'FLAP', 'AA>OW': 'VOWEL', 'AA>AO': 'VOWEL', 'ER>AA': 'VOWEL', 'ER>AH': 'VOWEL', 'L>UW': 'DARKL', 'L>UH': 'DARKL', 'L>OW': 'DARKL' };
  const ADVICE = {
    S_SH: 's と sh を 区別しよう（s は 歯のすき間から「スー」、sh は 唇を 丸めて「シュー」）。',
    F_H: 'f は、上の前歯を 下唇に 軽く 当てて 息を 出そう（「フ」に ならないように）。',
    TENSE: '長い母音（ee・oo）と 短い母音（i・u）の 長さの ちがいを 意識しよう。',
    FINAL: '最後の 音まで はっきり 言おう。',
    EPENTHESIS: '子音の あとに よけいな 母音が 入ったかも。子音で ピタッと 止めよう。',
    STRESS: 'を いちばん 強く 読もう。',
  };
  const INFO = {
    TH: 'th が s や t に なっても、ちゃんと 通じるよ（できれば 舌先を 歯に 当ててみよう）。',
    CH: 'ch・j の 音は そのままで 大丈夫。',
    W: 'w が「ウ」に 近く なっても 大丈夫。',
    FLAP: 't が やわらかく なるのは、アメリカ英語の 自然な 発音だよ。',
    VOWEL: '母音の 細かい ちがいは、気にしなくて 大丈夫。',
    DARKL: '最後の l が「ウ」っぽく なるのは、自然な 発音だよ。',
  };
  // 正しい音の並びと、AIが聞き取った音の並びを、そろえて比べる（置きかわり・抜け・増えた音を見つける）
  function align(target, heard) {
    const m = target.length, n = heard.length, G = -0.6;
    const sc = (a, b) => (nearScore(a, b) === 1 ? 1 : nearScore(a, b) === 0.5 ? 0.2 : -0.5);
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j * G : j === 0 ? i * G : 0)));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.max(dp[i - 1][j - 1] + sc(target[i - 1], heard[j - 1]), dp[i - 1][j] + G, dp[i][j - 1] + G);
    const ops = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + sc(target[i - 1], heard[j - 1])) { ops.push({ t: target[i - 1], h: heard[j - 1], i: i - 1 }); i--; j--; }
      else if (i > 0 && dp[i][j] === dp[i - 1][j] + G) { ops.push({ t: target[i - 1], h: null, i: i - 1 }); i--; }
      else { ops.push({ t: null, h: heard[j - 1] }); j--; }
    }
    return ops.reverse();
  }
  /** @returns {Assessment} */
  function assess(res, jw, d) {
    const F = [];
    if (!res || res.silent || res.tooShort) return { pass: false, score: 0, findings: [{ code: 'SILENT', level: 'block', kind: 'intelligibility', msg: '声が 聞こえなかったよ。マイクに 近づいて、はっきり 言おう。' }] };
    const ph = (res.phones || []).map((p) => p.ph);
    // 不合格になる理由（判定の本体 decide の結果）
    (d.reasons || []).forEach((r) => {
      if (r.type === 'word') F.push({ code: 'WORD', level: 'block', kind: 'intelligibility', msg: '単語として 聞き取れなかったよ。お手本を よく聞いて、もう一度。' });
      if (r.type === 'pair') F.push({ code: r.ph === 'R' || r.ph === 'L' ? 'RL' : 'BV', level: 'block', kind: 'phonemic', at: r.i, ph: r.ph, heard: r.heard, msg: advice({ pass: false, reasons: [r] }, jw) });
    });
    // 余分な母音（助言だけ）
    (res.insertions || []).forEach((x) => F.push({ code: 'EPENTHESIS', level: 'advise', kind: 'prosodic', at: x.after, ph: ph[x.after],
      msg: `「${ipa(ph[x.after])}」の あとに よけいな「${KANA[x.vowel] || 'ウ'}」が 入ったかも。子音で ピタッと 止めよう。` }));
    // 強く読む位置（助言だけ。AIの判定は約8割の正しさ）
    if (res.stress && res.stress.ok === false && jw && jw.syllables && jw.syllables.length > 1) {
      F.push({ code: 'STRESS', level: 'advise', kind: 'prosodic', msg: `「${jw.syllables[res.stress.expected] || ''}」${ADVICE.STRESS}` });
    }
    // 置きかわり・抜け（AIが自由に聞き取った音と比べる）
    if (res.heard && res.heard.length) {
      const seen = {};
      align(ph, res.heard).forEach((o, k, all) => {
        if (o.t && o.h && o.t !== o.h) {
          const key = o.t + '>' + o.h;
          if (CONTRAST[key] && !seen[CONTRAST[key]]) { seen[CONTRAST[key]] = 1; F.push({ code: CONTRAST[key], level: 'advise', kind: 'phonemic', at: o.i, ph: o.t, heard: o.h, msg: `${ipa(o.t)} が ${ipa(o.h)} に 聞こえたかも。` + ADVICE[CONTRAST[key]] }); }
          else if (VARIATION[key] && !seen[VARIATION[key]]) { seen[VARIATION[key]] = 1; F.push({ code: VARIATION[key], level: 'info', kind: 'variation', at: o.i, ph: o.t, heard: o.h, msg: INFO[VARIATION[key]] }); }
        }
        if (o.t && !o.h && o.i === ph.length - 1 && !VOWEL.has(o.t)) {
          if (o.t === 'L' || o.t === 'R') { if (!seen.DARKL && o.t === 'L') { seen.DARKL = 1; F.push({ code: 'DARKL', level: 'info', kind: 'variation', msg: INFO.DARKL }); } }
          else if (!seen.FINAL) { seen.FINAL = 1; F.push({ code: 'FINAL', level: 'advise', kind: 'phonemic', at: o.i, ph: o.t, msg: `最後の「${ipa(o.t)}」が 聞こえにくかったかも。` + ADVICE.FINAL }); }
        }
      });
    }
    // 先生向けの点数（記録用。合否には使わない）：不合格の理由 -30、助言 -10（余分な母音は -12）
    const score = Math.max(0, 100 - F.reduce((a, f) => a + (f.level === 'block' ? 30 : f.level === 'advise' ? (f.code === 'EPENTHESIS' ? 12 : 10) : 0), 0));
    return { pass: d.pass, score, findings: F };
  }
  // 生徒向けの表示：直すことは多くても2つ、コツも2つまで。許容できる癖は「気にしなくてOK」で安心させる
  function feedbackHtml(a, word) {
    const pick = (lv, max) => a.findings.filter((f) => f.level === lv).slice(0, max);
    const block = pick('block', 2), adv = pick('advise', a.pass ? 2 : 1), info = pick('info', 2);
    const li = (fs) => `<ul>${fs.map((f) => `<li>${f.msg}</li>`).join('')}</ul>`;
    return `<div class="fbk">
      ${block.length ? `<div class="fbk-b"><b>🔴 ここを 直そう</b>${li(block)}</div>` : ''}
      ${adv.length ? `<div class="fbk-a"><b>💡 もっと 良くなる コツ</b>${li(adv)}</div>` : ''}
      ${info.length ? `<div class="fbk-i"><b>👍 気にしなくて OK</b>${li(info)}</div>` : ''}
      ${!block.length && !adv.length && !info.length && a.pass ? '<div class="fbk-i"><b>👍 とても いい 発音！</b></div>' : ''}
    </div>`;
  }

  // 判定する
  async function judge(blob, word, mode, onProgress) {
    const jw = await wordInfo(word);
    if (!jw) return { pass: true, unknown: true, html: '<p class="small muted">この単語は発音を判定できませんでした（判定なしで進みます）。</p>' };
    const pcm = focusLoudest(await Rec.toPCM16k(blob)).pcm; // いちばん大きな音（生徒の声）だけで判定
    const res = await PronJudge.judge(pcm, jw, onProgress);
    const d = decide(res, mode);
    const a = assess(res, jw, d);
    const detail = (res.silent || res.tooShort) ? '' : `<details class="pj-detail"><summary>くわしい判定を見る（参考）</summary>${PronJudge.render(res, jw)}</details>`;
    return { pass: d.pass, silent: d.reason === 'silent', res, decision: d, assessment: a, advice: advice(d, jw), html: feedbackHtml(a, word) + detail };
  }

  async function modelReady() { try { return await PronJudge.isCached(); } catch { return false; } }

  return { speak, listen, judge, wordInfo, modelReady, decide, advice, assess, feedbackHtml, align, RULE, configure, focusLoudest, matchRate };
})();
