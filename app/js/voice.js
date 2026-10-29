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
    const auto = new Promise((r) => { resolveAuto = r; });
    const rec = await Rec.start({
      maxMs,
      onAutoStop: (r) => resolveAuto(r),
      onLevel: (v) => {
        const now = Date.now(), dt = now - lastT; lastT = now;
        if (onLevel) onLevel(v);
        if (v > 0.18) { heard += dt; quietSince = 0; }
        else if (heard > minVoiceMs) { if (!quietSince) quietSince = now; else if (now - quietSince > silenceMs) resolveAuto(null); }
      },
    });
    const r = await auto;
    const result = r || await rec.stop();
    result.heardMs = heard;
    return result;
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
    // （2026年10月29日：生徒が合格しにくいとの報告で緩めた。bad -5.5→-8、割合 1/3→1/2）
    badRatio: { strict: 1 / 2, loose: 2 / 3 },
    bad: -8,
    // 「AIがほとんど聞き取れなかった」だけでは不合格にしない（はっきり違う音もあるときだけ不合格）
    lowSignalFails: false,
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
  }
  const KANA = { UW: 'ウ', UH: 'ウ', AH: 'ア', OW: 'オ', IH: 'イ', IY: 'イ' };

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
    if (badN > allow || (res.lowSignal && (RULE.lowSignalFails || badN > 0))) reasons.push({ type: 'word' });
    if (mode !== 'loose') {
      // ② r と l、b と v
      ph.forEach((p, i) => {
        const other = RULE.pairs[p.ph];
        if (other && p.heard === other && p.gop < RULE.pairLimit) reasons.push({ type: 'pair', i, ph: p.ph, heard: other });
      });
      // ③ 余分な母音
      if (RULE.insertFails) (res.insertions || []).forEach((x) => reasons.push({ type: 'insert', after: x.after, vowel: x.vowel }));
    }
    return { pass: reasons.length === 0, reasons, badN, allow };
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
    const pcm = await Rec.toPCM16k(blob);
    const res = await PronJudge.judge(pcm, jw, onProgress);
    const d = decide(res, mode);
    const detail = (res.silent || res.tooShort) ? PronJudge.render(res, jw)
      : `<details class="pj-detail"><summary>くわしい判定を見る（参考）</summary>${PronJudge.render(res, jw)}</details>`;
    return { pass: d.pass, silent: d.reason === 'silent', res, decision: d, advice: advice(d, jw), html: detail };
  }

  async function modelReady() { try { return await PronJudge.isCached(); } catch { return false; } }

  return { speak, listen, judge, wordInfo, modelReady, decide, advice, RULE, configure };
})();
