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

  // 判定する。mode：'strict'（発音ステップ：×の音節がなければ合格）、'loose'（書く練習：半分以上が×でなければ合格）
  async function judge(blob, word, mode, onProgress) {
    const jw = await wordInfo(word);
    if (!jw) return { pass: true, unknown: true, html: '<p class="small muted">この単語は発音を判定できませんでした（判定なしで進みます）。</p>' };
    const pcm = await Rec.toPCM16k(blob);
    const res = await PronJudge.judge(pcm, jw, onProgress);
    if (res.silent || res.tooShort) return { pass: false, silent: true, res, html: PronJudge.render(res, jw) };
    const sy = res.syllables || [];
    const bad = sy.filter((s) => s.verdict === 'bad').length;
    const pass = mode === 'loose' ? (sy.length ? bad <= Math.floor(sy.length / 2) && !(sy.length === 1 && bad === 1 && res.lowSignal) : true) : bad === 0;
    return { pass, res, bad, total: sy.length, html: PronJudge.render(res, jw) };
  }

  async function modelReady() { try { return await PronJudge.isCached(); } catch { return false; } }

  return { speak, listen, judge, wordInfo, modelReady };
})();
