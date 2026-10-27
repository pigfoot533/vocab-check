// 発音の判定（段階2）：画面側の窓口と、結果の表示
// 計算は js/pron-worker.js（別スレッド）で行う。録音はこの端末の中だけで処理し、外部に送らない。
const PronJudge = (() => {
  const MODEL_MB = 116;
  const MODEL_NAME = 'HuBERT 音素認識モデル（Peacockery/hubert-base-phoneme-en を ron-jo が変換したもの・Apache-2.0）';
  let worker = null, seq = 0;
  const pending = new Map();
  function w() {
    if (!worker) {
      worker = new Worker('js/pron-worker.js');
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id); if (!p) return;
        if (e.data.progress) { p.onProgress && p.onProgress(e.data.progress); return; }
        pending.delete(e.data.id);
        e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.result);
      };
      worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(`判定の準備に失敗しました（${e.message || '不明なエラー'}）。`)); pending.clear(); worker = null; };
    }
    return worker;
  }
  const call = (type, data, onProgress) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, onProgress }); w().postMessage({ id, type, data }); });
  const supported = () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof caches !== 'undefined';
  const isCached = () => (supported() ? call('cached') : Promise.resolve(false));
  const clear = () => call('clear');
  async function judge(pcm, word, onProgress) {
    if (!word.phon || !word.phon.phones || !word.phon.phones.length) throw new Error('この単語には発音のデータ（音素の並び）がないため判定できません。単語の編集で発音を辞書から入れ直してください。');
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* なし */ }
    return call('judge', { pcm, phon: word.phon, stress: word.stress }, onProgress);
  }

  // ===== 表示 =====
  const IPA = { AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', F: 'f', G: 'ɡ', HH: 'h', IH: 'ɪ', IY: 'i', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', OW: 'oʊ', OY: 'ɔɪ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', UH: 'ʊ', UW: 'u', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ' };
  // 日本語を話す人がつまずきやすい音のコツ
  const TIPS = {
    TH: '舌先を上の前歯に軽く当て、そのすき間から息を出します（「ス」にならないように）。',
    DH: '舌先を上の前歯に軽く当てたまま、声を出します（「ズ」「ド」にならないように）。',
    R: '舌先をどこにも付けず、少し奥に引いて唇を丸めます。',
    L: '舌先を上の前歯の裏の歯ぐきにしっかり付けて声を出します。',
    F: '上の前歯を下唇に軽く当て、すき間から息を出します（「フ」にならないように）。',
    V: '上の前歯を下唇に軽く当てたまま、声を出します（「ブ」にならないように）。',
    W: '唇を小さく丸めて前に突き出してから、次の音に移ります。',
    AE: '「エ」の口の形で「ア」と言うように、口を横に大きく開きます。',
    ER: '舌を奥に引いて、こもった「アー」のように言います。',
    AH: '口を軽く開いて、短く弱い「ア」と言います。',
    AA: '口を縦に大きく開けて、のどの奥から「ア」と言います。',
    IH: '「イ」と「エ」の間のような、短くゆるんだ音です。',
    IY: '口を横に引いて、はっきり長めの「イー」です。',
    UH: '唇を軽く丸めた、短くゆるんだ「ウ」です。',
    UW: '唇をしっかり丸めて突き出した「ウー」です。',
    SH: '唇を丸めて突き出し、「シュ」と息を出します。',
    S: '舌先を歯ぐきに近づけ、すき間から「スー」と息だけを出します。',
    Z: '「ス」の口のまま声を出します。',
    NG: '舌の奥を上あごに付けたまま、鼻から声を出します（「グ」と言わない）。',
    HH: '息だけで軽く「ハ」と出します。',
  };
  const VOWEL_KANA = { UW: 'ウ', UH: 'ウ', AH: 'ア', OW: 'オ', IH: 'イ', IY: 'イ' };
  const MARK = { good: '◎', fair: '△', bad: '×' };
  const MARK_LABEL = { good: 'よい', fair: 'おしい', bad: 'もう少し' };
  const ph = (p) => `/${IPA[p] || p.toLowerCase()}/`;

  function sylTexts(word, res) {
    const sy = word.syllables || [];
    if (sy.length === res.syllables.length) return sy;
    return res.syllables.map((s) => res.phones.slice(s.from, s.to).map((x) => IPA[x.ph] || '').join(''));
  }
  function render(res, word) {
    if (res.silent) return '<p class="notice warn small">声が録音されていないようです。マイクに近づいて、もう一度録音してください。</p>';
    if (res.tooShort) return '<p class="notice warn small">声が短すぎて判定できませんでした。単語全体をはっきり言って、もう一度録音してください。</p>';
    const sy = sylTexts(word, res);
    const chips = res.syllables.map((s, k) => `<span class="pj-syl pj-${s.verdict}${k === word.stress && sy.length > 1 ? ' pj-stress' : ''}"><span class="en">${U.esc(sy[k])}</span><strong aria-label="${MARK_LABEL[s.verdict]}">${MARK[s.verdict]}</strong></span>`).join('');
    const notes = [];
    const tipShown = new Set();
    res.syllables.forEach((s, k) => {
      for (let i = s.from; i < s.to; i++) {
        const p = res.phones[i];
        if (p.verdict === 'good') continue;
        let msg = `「<span class="en">${U.esc(sy[k])}</span>」の ${ph(p.ph)}：`;
        if (p.heard === '-') msg += 'はっきり聞き取れませんでした。';
        else if (p.heard) msg += `${ph(p.heard)} に近く聞こえました。`;
        else msg += 'もう少しはっきり言ってみましょう。';
        if (TIPS[p.ph] && !tipShown.has(p.ph)) { msg += `<br><span class="muted">コツ：${TIPS[p.ph]}</span>`; tipShown.add(p.ph); }
        notes.push({ bad: p.verdict === 'bad', html: msg });
      }
      for (const x of s.insert) {
        notes.push({ bad: true, html: `「<span class="en">${U.esc(sy[k])}</span>」の ${ph(res.phones[x.after].ph)} のあとに、「${VOWEL_KANA[x.vowel] || 'ウ'}」のような余分な母音が入っているようです。<br><span class="muted">コツ：子音のあとに母音を付けず、次の音にそのまま続けます（例：strawberry は「ス・ト・ロ」ではなく str をひと息で）。</span>` });
      }
    });
    notes.sort((a, b) => b.bad - a.bad);
    let stressHtml = '';
    if (res.stress && sy.length > 1) {
      const exp = res.stress.expected;
      if (res.stress.ok === true) stressHtml = `<p class="small">強く読む場所：<strong>第${exp + 1}音節（${U.esc(sy[exp])}）</strong>を強く読めているようです。◎</p>`;
      else if (res.stress.ok === false) stressHtml = `<p class="small">強く読む場所：<strong>第${res.stress.detected + 1}音節（${U.esc(sy[res.stress.detected])}）</strong>を強く読んでいるように聞こえました。<strong>第${exp + 1}音節（${U.esc(sy[exp])}）</strong>を強く・長く・高めに言ってみましょう。</p>`;
      else stressHtml = '<p class="small muted">強く読む場所は、はっきり判定できませんでした。</p>';
    }
    const allGood = !notes.length;
    return `
      <div class="pj-result">
        <div class="pj-syls" aria-label="音節ごとの判定">${chips}</div>
        <p class="small muted mb0">◎ よい　△ おしい　× もう少し（色の付いた音節が強く読む音節）</p>
        ${allGood ? '<p class="notice ok small mt">音の正確さの面では、目立つ問題は見つかりませんでした。</p>' : `<ul class="small mt">${notes.slice(0, 5).map((n) => `<li>${n.html}</li>`).join('')}</ul>${notes.length > 5 ? `<p class="small muted">ほかに${notes.length - 5}か所あります。上のものから直してみましょう。</p>` : ''}`}
        ${stressHtml}
        ${res.lowSignal ? '<p class="notice info small">英語の音として聞き取れた部分が少なかったため、判定が正確でない可能性があります。静かな場所で、マイクに近づいてはっきり言ってみましょう。</p>' : ''}
        <p class="small muted mb0"><strong>判定は目安です。</strong>機械による判定のため、正しく言えていても△や×になったり、その逆になったりすることがあります。模範音声と聞き比べたり、先生に確かめたりしてください。アメリカ・イギリス・オーストラリアなどの地域による発音の違い（car の r を発音しない、day が「ダイ」に近い など）は、まちがいとして扱いません。</p>
      </div>`;
  }
  // 段階3（Geminiへの相談）で使う、判定結果の短いまとめ（英語の単語と記号だけ・声そのものは含まない）
  function summary(res, word) {
    if (!res || res.silent || res.tooShort) return null;
    const sy = sylTexts(word, res);
    return {
      syllables: res.syllables.map((s, k) => ({ text: sy[k], mark: MARK[s.verdict] })),
      problems: res.phones.map((p, i) => ({ ...p, i })).filter((p) => p.verdict !== 'good').map((p) => ({ sound: ph(p.ph), heardAs: p.heard === '-' ? '聞き取れない' : p.heard ? ph(p.heard) : '', syllable: sy[res.syllables.findIndex((s) => p.i >= s.from && p.i < s.to)] })),
      insertions: res.insertions.map((x) => ({ after: ph(res.phones[x.after].ph), vowel: VOWEL_KANA[x.vowel] || 'ウ' })),
      stress: res.stress ? { expected: res.stress.expected + 1, heard: res.stress.detected != null ? res.stress.detected + 1 : null } : null,
    };
  }
  // ===== 段階3：Gemini に発音のアドバイスをもらう（コピー＆貼り付け。Gemini の API は使わない） =====
  // 依頼文はこの1か所だけ。{…} の部分をアプリが埋める。Gemini に渡すのは英単語・発音記号・判定の記号だけで、声そのものや名前は含まない
  const ADVICE_REQUEST = `あなたは、日本の{学年}に英語の発音を教える、やさしい先生です。
生徒が英単語を発音し、アプリが機械で判定しました。この判定をもとに、発音のアドバイスをしてください。

【単語】{単語}
【発音記号】{発音記号}
【音節】{音節}（強く読むのは第{強勢}音節）

【アプリの判定（機械による目安）】
- 音節ごと（◎よい △おしい ×もう少し）：{音節ごとの判定}
- 問題がありそうな音：{問題の音}
- 子音のあとの余分な母音：{余分な母音}
- 強く読む場所：{強勢の判定}

【お願い】
1. 直すとよい点を、大事な順に最大3つ挙げてください。口・舌・唇・息をどう使うかを、具体的に説明してください。
2. カタカナだけで発音を書くのは避け、似ている日本語の音との違いとして説明してください。
3. 練習のしかたを1つ提案してください（例：音節ごとにゆっくり → ふつうの速さ）。
4. アメリカ・イギリス・オーストラリアなどの地域による発音の違い（母音のあとの r を発音しない、/eɪ/ が /aɪ/ に近い など）は、まちがいとして扱わないでください。
5. 最後に「機械の判定はまちがうこともあるので、模範音声と聞き比べよう」と一言添えてください。
6. {学年}にも分かる言葉で、全体を300字以内にしてください。`;
  function adviceRequest(word, summary, levelKey) {
    const sm = summary || { syllables: [], problems: [], insertions: [], stress: null };
    const sy = (word.syllables || []).length ? word.syllables : sm.syllables.map((s) => s.text);
    const fill = {
      学年: levelKey === 'shs' ? '高校生' : '中学生',
      単語: word.word,
      発音記号: word.ipa || '（なし）',
      音節: sy.join('・') || word.word,
      強勢: word.stress != null ? String(word.stress + 1) : '?',
      音節ごとの判定: sm.syllables.map((s) => `${s.text} ${s.mark}`).join(' / ') || '（判定なし）',
      問題の音: sm.problems.length ? sm.problems.map((p) => `「${p.syllable}」の ${p.sound}${p.heardAs ? `（${p.heardAs === '聞き取れない' ? 'はっきり聞き取れない' : `${p.heardAs} に近く聞こえた`}）` : ''}`).join('、') : '目立つものはなし',
      余分な母音: sm.insertions.length ? sm.insertions.map((x) => `${x.after} のあとに「${x.vowel}」のような母音`).join('、') : 'なし',
      強勢の判定: !sm.stress ? '判定なし（1音節の語）' : sm.stress.heard == null ? 'はっきり判定できなかった' : sm.stress.heard === sm.stress.expected ? `正しく第${sm.stress.expected}音節を強く読めていた` : `第${sm.stress.heard}音節を強く読んでいるように聞こえた（正しくは第${sm.stress.expected}音節）`,
    };
    return ADVICE_REQUEST.replace(/\{([^}]+)\}/g, (m, k) => (k in fill ? fill[k] : m));
  }
  function adviceHtml() {
    return `<div class="mt" id="pj-adv">
      <a class="btn" id="pj-adv-btn" href="${GeminiLink.URL}" target="_blank" rel="noopener noreferrer">💬 Geminiに発音アドバイスをもらう ↗</a>
      <p class="small muted">押すと、判定結果をまとめた依頼文がコピーされ、Gemini が新しいタブで開きます。Gemini の入力欄に貼り付けて送ってください。Gemini に渡るのは英単語と判定の記号だけで、声やニックネームは渡りません。<strong>Gemini を開くときだけインターネットが必要です。</strong></p>
      <div id="pj-adv-fallback"></div>
    </div>`;
  }
  // ボタンを押したときに呼ぶ（新しいタブを開くのはリンクそのものが行う）
  async function copyAdvice(text, fallbackEl) {
    try { await navigator.clipboard.writeText(text); U.toast('依頼文をコピーしました。Gemini の入力欄に貼り付けてください'); return true; }
    catch {
      // 古いブラウザ向けのコピー方法
      try {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); const ok = document.execCommand && document.execCommand('copy'); t.remove();
        if (ok) { U.toast('依頼文をコピーしました。Gemini の入力欄に貼り付けてください'); return true; }
      } catch { /* 次の方法へ */ }
      fallbackEl.innerHTML = `<label class="small" for="pj-adv-text">自動でコピーできませんでした。下の依頼文を長押し（または Ctrl+A）で全部選んでコピーし、Gemini に貼り付けてください。</label><textarea id="pj-adv-text" readonly style="min-height:160px;font-size:.85rem">${U.esc(text)}</textarea>`;
      const ta = fallbackEl.querySelector('textarea'); ta.focus(); ta.select();
      return false;
    }
  }
  return { MODEL_MB, MODEL_NAME, ADVICE_REQUEST, supported, isCached, judge, clear, render, summary, adviceRequest, adviceHtml, copyAdvice };
})();
