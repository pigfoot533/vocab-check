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
  async function listen({ maxMs = 3500, onLevel, minVoiceMs = 150, silenceMs = 700 } = {}) {
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
    const r = await auto;
    const result = r || await rec.stop();
    result.heardMs = heard;
    return result;
  }

  // ===== 録音の中から、いちばん大きな音（＝iPadの近くで話している生徒の声）だけを取り出す =====
  // 周りの話し声やテレビの音は、iPadの目の前で話す声より小さいので、判定の前に取りのぞく。
  // ただし、机をたたく音のような「短すぎる大きな音」は声ではないので、次に大きい音を選ぶ。
  const FOCUS = { frame: 320, minVoice: 0.12, gap: 0.35, pad: 0.12, extend: 0.3 }; // 秒（16kHz で 320＝20ミリ秒）
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
    // 声の中心を探す基準：周りの音よりはっきり大きい音（ただし、いちばん大きな音の35%より厳しくはしない）
    const core = Math.min(peak * 0.35, Math.max(peak * 0.12, noise * 3, middle * 2));
    const low = Math.max(peak * 0.12, noise * 3); // 声の端（弱い子音など）を拾う基準
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
    ['IY', 'IH', 'EY'], ['EH', 'AE', 'AH', 'EY'], ['AA', 'AO', 'AH', 'OW'], ['UW', 'UH', 'OW'], ['ER', 'AH', 'R'], ['AY', 'AA', 'AE'], ['AW', 'AA', 'OW'], ['OY', 'AO']];
  const near = (a, b) => a === b || NEAR.some((g) => g.includes(a) && g.includes(b));
  // AIが聞き取った音の並び（heard）と、正しい音の並び（target）が、どれだけ同じ順番でそろっているか（0〜1）
  function matchRate(target, heard) {
    if (!target.length) return 1;
    if (!heard || !heard.length) return 0;
    const m = target.length, n = heard.length, dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = near(target[i - 1], heard[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
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
    if (badN > allow || (res.lowSignal && (RULE.lowSignalFails || badN > 0)) || rate < RULE.matchMin) reasons.push({ type: 'word' });
    if (mode !== 'loose') {
      // ② r と l、b と v
      ph.forEach((p, i) => {
        const other = RULE.pairs[p.ph];
        if (other && p.heard === other && p.gop < RULE.pairLimit) reasons.push({ type: 'pair', i, ph: p.ph, heard: other });
      });
      // ③ 余分な母音
      if (RULE.insertFails) (res.insertions || []).forEach((x) => reasons.push({ type: 'insert', after: x.after, vowel: x.vowel }));
    }
    return { pass: reasons.length === 0, reasons, badN, allow, rate: Math.round(rate * 100) / 100 };
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

  // 判定する
  async function judge(blob, word, mode, onProgress) {
    const jw = await wordInfo(word);
    if (!jw) return { pass: true, unknown: true, html: '<p class="small muted">この単語は発音を判定できませんでした（判定なしで進みます）。</p>' };
    const pcm = focusLoudest(await Rec.toPCM16k(blob)).pcm; // いちばん大きな音（生徒の声）だけで判定
    const res = await PronJudge.judge(pcm, jw, onProgress);
    const d = decide(res, mode);
    const detail = (res.silent || res.tooShort) ? PronJudge.render(res, jw)
      : `<details class="pj-detail"><summary>くわしい判定を見る（参考）</summary>${PronJudge.render(res, jw)}</details>`;
    return { pass: d.pass, silent: d.reason === 'silent', res, decision: d, advice: advice(d, jw), html: detail };
  }

  async function modelReady() { try { return await PronJudge.isCached(); } catch { return false; } }

  return { speak, listen, judge, wordInfo, modelReady, decide, advice, RULE, configure, focusLoudest, matchRate };
})();
