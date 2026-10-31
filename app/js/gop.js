// 発音の判定（段階2）の計算部分。画面にもワーカーにも読み込める、計算だけのファイル
// 音素認識モデル（HuBERT・ARPAbet 39音素）が出した「各時刻にどの音らしいか」の表を使い、
//   ① 音素ごとの良さ（GOP）：正しい並びの当てはまり と、その音を別の音に替えた／抜いた並びの当てはまり の差
//   ② 余分な母音（例：strawberry → s"u"t"o"roberii）：子音のあとに母音を入れた並びの方が当てはまるか
//   ③ 強勢：音節ごとの声の大きさと長さ
// を計算する。判定はあくまで目安。
const GOP = (() => {
  const VOCAB = ['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'B', 'CH', 'D', 'DH', 'EH', 'ER', 'EY', 'F', 'G', 'HH', 'IH', 'IY', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW', 'OY', 'P', 'R', 'S', 'SH', 'T', 'TH', 'UH', 'UW', 'V', 'W', 'Y', 'Z', 'ZH'];
  const BLANK = 40;
  const ID = Object.fromEntries(VOCAB.map((p, i) => [p, i]));
  const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
  const INSERT_VOWELS = ['UW', 'UH', 'AH', 'OW', 'IH', 'IY']; // 日本語の「ウ・オ・イ」に近い母音
  // ===== 判定の基準（実際の声で調整するときはここだけ直す） =====
  const TH = {
    // 合成音声での試験（2026年10月）：正しい発音の音素はほぼ -1 以上、別の音（th→s, r→l）は -7 前後
    // 実機で「厳しすぎる」との報告があり緩めた（2026年10月）：◎ -1.0→-2.0、△ -4.0→-5.5
    good: -2.0, // これ以上：◎（正しい音の方がはっきり当てはまる）
    fair: -5.5, // これ以上：△、未満：×
    // 言い方のゆれ・地域による違いとして認める音（この音に聞こえても減点しない）
    //   アメリカ：s/z、t/d（water の t など）、ɑ/ɔ
    //   イギリス：bath・can't の母音 æ→ɑː、lot の母音 ɒ（ɑ・ɔ の間）、go の母音 əʊ（ʌ に近い始まり）、bird の母音 ɜː（r なし）
    //   オーストラリア：day の eɪ→aɪ 寄り、my の aɪ→ɔɪ 寄り、see の iː→əi 寄り、go の oʊ→aʊ 寄り
    equiv: {
      S: ['Z'], Z: ['S'], T: ['D', 'CH'], D: ['T', 'JH'],
      // AIは ch（/tʃ/）を t、j（/dʒ/）を d と聞き取りやすいので、ゆれとして認める（2026年11月：「チュ」が /t/ と判定される報告）
      CH: ['T', 'SH'], JH: ['D', 'ZH'],
      AA: ['AO', 'AE'], AO: ['AA'], AE: ['AA', 'EH'],
      OW: ['AW', 'AH', 'AO'], EY: ['AY', 'EH'], AY: ['OY', 'AA'], IY: ['IH', 'EY'],
      ER: ['AH', 'EH', 'AO'], AW: ['AE'],
    },
    // イギリス英語などで、母音のあとの r（car, teacher, world）は発音しなくても減点しない
    nonRhotic: true,
    // 弱く読む母音（強勢0）は、あいまいな母音どうしの違いを減点しない
    reduced: ['AH', 'IH', 'EH', 'UH', 'IY', 'ER'],
    // 母音を入れた並びとの差。正しい発音では -2 以下、母音を入れた発音（thinku, sutoro…）では -0.5〜+1.6 だった
    insert: -0.7, // 実機の報告を受けて -1.0 から少し緩めた
    stressMargin: 0.35, // 強く読んだ音節の判定に必要な差（これ未満なら「はっきりしない」）
    // 強く読む音節の推定の重み：大きさ・高さ・長さ。話すと語の後ろほど声が小さく低くなるので、その分（Slope：音節1つにつき）を足して比べる。
    // 最後の音節は伸びやすいので、長さに finalLen を掛ける。Kokoro の自然な音声13語で 12語正解の組み合わせ
    stressW: { energy: 0.2, pitch: 0.2, length: 0.6, energySlope: 1, pitchSlope: 0.05, finalLen: 0.8 },
  };

  const lse = (a, b) => (a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b))));
  // logits(T×C) → 対数確率
  function logSoftmax(data, T, C) {
    const out = new Float32Array(T * C);
    for (let t = 0; t < T; t++) {
      let m = -Infinity; for (let c = 0; c < C; c++) m = Math.max(m, data[t * C + c]);
      let s = 0; for (let c = 0; c < C; c++) s += Math.exp(data[t * C + c] - m);
      const z = m + Math.log(s);
      for (let c = 0; c < C; c++) out[t * C + c] = data[t * C + c] - z;
    }
    return out;
  }
  // CTC の前向き計算：並び labels がこの音声に当てはまる度合い（対数）
  function ctcLL(lp, T, C, labels) {
    const N = labels.length; if (!N) return -Infinity;
    const S = 2 * N + 1;
    const lab = (s) => (s % 2 ? labels[(s - 1) >> 1] : BLANK);
    let a = new Float64Array(S).fill(-Infinity), b = new Float64Array(S);
    a[0] = lp[BLANK]; a[1] = lp[lab(1)];
    for (let t = 1; t < T; t++) {
      for (let s = 0; s < S; s++) {
        let v = a[s];
        if (s > 0) v = lse(v, a[s - 1]);
        if (s > 1 && s % 2 && lab(s) !== lab(s - 2)) v = lse(v, a[s - 2]);
        b[s] = v + lp[t * C + lab(s)];
      }
      [a, b] = [b, a];
    }
    return lse(a[S - 1], a[S - 2]);
  }
  // CTC の強制整列：正しい並びの各音素が、どの時刻に当たるか
  function align(lp, T, C, labels) {
    const N = labels.length, S = 2 * N + 1;
    const lab = (s) => (s % 2 ? labels[(s - 1) >> 1] : BLANK);
    const dp = new Float64Array(T * S).fill(-Infinity), bp = new Int8Array(T * S);
    dp[0] = lp[BLANK]; dp[1] = lp[lab(1)];
    for (let t = 1; t < T; t++) {
      for (let s = 0; s < S; s++) {
        let best = dp[(t - 1) * S + s], k = 0;
        if (s > 0 && dp[(t - 1) * S + s - 1] > best) { best = dp[(t - 1) * S + s - 1]; k = 1; }
        if (s > 1 && s % 2 && lab(s) !== lab(s - 2) && dp[(t - 1) * S + s - 2] > best) { best = dp[(t - 1) * S + s - 2]; k = 2; }
        dp[t * S + s] = best + lp[t * C + lab(s)]; bp[t * S + s] = k;
      }
    }
    let s = dp[(T - 1) * S + S - 1] >= dp[(T - 1) * S + S - 2] ? S - 1 : S - 2;
    const first = new Array(N).fill(-1), last = new Array(N).fill(-1);
    for (let t = T - 1; t >= 0; t--) {
      if (s % 2) { const i = (s - 1) >> 1; last[i] = last[i] < 0 ? t : last[i]; first[i] = t; }
      s -= bp[t * S + s];
    }
    return { first, last };
  }
  // 自由に聞き取った音素（確認用）
  function greedy(lp, T, C) {
    const out = []; let prev = -1;
    for (let t = 0; t < T; t++) { let bi = 0; for (let c = 1; c < C; c++) if (lp[t * C + c] > lp[t * C + bi]) bi = c; if (bi !== prev && bi < VOCAB.length) out.push(VOCAB[bi]); prev = bi; }
    return out;
  }

  // 判定の本体
  // logits: Float32Array(T×C), phon: { phones:['S','T','R','AO1',…], starts:[音節の始まりの音素番号] }, stress: 強く読む音節（0から）, pcm: 16kHzの音声
  function score(logits, T, C, phon, stress, pcm) {
    const energy = pcm ? energyDb(pcm, T) : null;
    const phones = phon.phones.map((p) => p.replace(/\d/g, ''));
    const labels = phones.map((p) => ID[p]);
    if (labels.some((x) => x == null)) throw new Error('この単語の発音データに判定できない音が含まれています。');
    if (T < labels.length + 2) return { tooShort: true };
    const lp = logSoftmax(logits, T, C);
    // 認める音（辞書の別の発音・言い方のゆれ・地域の違い）のうち、録音にいちばん合うものを基準にする
    // （例：オーストラリア式に day を「ダイ」と言ったら、/eɪ/ の代わりに /aɪ/ を基準にして、ほかの音を比べる）
    const alts0 = (phon.alts || []).map((a) => a.map((p) => p.replace(/\d/g, ''))).filter((a) => a.length === phones.length);
    const allowedOf = (p, i) => {
      const s = new Set(TH.equiv[p] || []);
      alts0.forEach((a) => s.add(a[i]));
      if (/0$/.test(phon.phones[i]) && TH.reduced.includes(p)) TH.reduced.forEach((x) => s.add(x));
      s.delete(p);
      return s;
    };
    let LL0 = ctcLL(lp, T, C, labels);
    for (let i = 0; i < labels.length; i++) {
      for (const a of allowedOf(phones[i], i)) {
        if (ID[a] == null) continue;
        const alt = labels.slice(); alt[i] = ID[a];
        const ll = ctcLL(lp, T, C, alt);
        if (ll > LL0) { LL0 = ll; labels[i] = ID[a]; }
      }
    }
    const heardAll = greedy(lp, T, C);
    // ① 音素ごと
    // 正解として認める音：辞書の別の発音（translate の /s/ と /z/ など）、言い方のゆれ、弱く読む母音どうし
    const allowed = phones.map((p, i) => { const s = allowedOf(p, i); s.add(p); s.delete(VOCAB[labels[i]]); return s; });
    // 母音のあとで、次に母音が続かない r（car, teacher）は、なくてもよい音として扱う
    const optionalR = phones.map((p, i) => TH.nonRhotic && p === 'R' && i > 0 && VOWELS.has(phones[i - 1]) && !(i + 1 < phones.length && VOWELS.has(phones[i + 1])));
    const res = phones.map((p, i) => {
      let bestAlt = -Infinity, heard = null;
      if (labels.length > 1 && !optionalR[i]) { const del = ctcLL(lp, T, C, labels.filter((_, k) => k !== i)); if (del > bestAlt) { bestAlt = del; heard = '-'; } }
      for (let c = 0; c < VOCAB.length; c++) {
        if (c === labels[i] || allowed[i].has(VOCAB[c])) continue;
        const alt = labels.slice(); alt[i] = c;
        const ll = ctcLL(lp, T, C, alt);
        if (ll > bestAlt) { bestAlt = ll; heard = VOCAB[c]; }
      }
      let g = LL0 - bestAlt;
      // なくてもよい r：r を抜いた並びがほぼ同じくらい当てはまるなら（イギリス式に r を発音していない）、よいとする
      if (optionalR[i] && g < TH.good) {
        const del = ctcLL(lp, T, C, labels.filter((_, k) => k !== i));
        if (del >= LL0 - 1) { g = TH.good; heard = null; }
      }
      return { ph: p, gop: Math.round(g * 100) / 100, verdict: g >= TH.good ? 'good' : g >= TH.fair ? 'fair' : 'bad', heard: g < TH.good ? heard : null };
    });
    // ② 余分な母音
    const insertions = [];
    for (let i = 0; i < phones.length; i++) {
      if (VOWELS.has(phones[i]) || (i + 1 < phones.length && VOWELS.has(phones[i + 1]))) continue;
      let best = -Infinity, bv = null;
      for (const vw of INSERT_VOWELS) {
        const alt = labels.slice(0, i + 1).concat([ID[vw]], labels.slice(i + 1));
        const ll = ctcLL(lp, T, C, alt);
        if (ll > best) { best = ll; bv = vw; }
      }
      if (best - LL0 >= TH.insert) insertions.push({ after: i, vowel: bv, gain: Math.round((best - LL0) * 100) / 100 });
    }
    // ③ 音節ごと・強勢
    const starts = phon.starts && phon.starts.length ? phon.starts : [0];
    const al = align(lp, T, C, labels);
    const syl = starts.map((s, k) => {
      const e = k + 1 < starts.length ? starts[k + 1] : phones.length;
      const idx = []; for (let i = s; i < e; i++) idx.push(i);
      const ps = idx.map((i) => res[i]);
      const verdict = ps.some((x) => x.verdict === 'bad') ? 'bad' : ps.some((x) => x.verdict === 'fair') ? 'fair' : 'good';
      const ins = insertions.filter((x) => x.after >= s && x.after < e);
      const t0 = al.first[s], t1 = (k + 1 < starts.length ? al.first[starts[k + 1]] : al.last[phones.length - 1] + 3);
      // 母音のまわり（母音の時刻の前後3コマ＝約60ミリ秒）で、声の大きさと高さを測る
      const vi = idx.find((i) => VOWELS.has(phones[i]));
      const c0 = vi != null ? al.first[vi] : t0, c1 = vi != null ? al.last[vi] : t1;
      let peak = -Infinity, f0 = 0;
      if (energy) for (let t = Math.max(0, c0 - 3); t <= Math.min(energy.length - 1, c1 + 3); t++) peak = Math.max(peak, energy[t]);
      if (pcm) for (let t = Math.max(0, c0 - 3); t <= Math.min(T - 1, c1 + 3); t++) f0 = Math.max(f0, pitch(pcm, t * 320, 640));
      return { from: s, to: e, verdict: ins.length && verdict === 'good' ? 'fair' : verdict, insert: ins, frames: Math.max(1, t1 - t0), peak, f0: Math.round(f0) };
    });
    let stressRes = null;
    if (syl.length >= 2 && energy && stress != null) {
      // 大きさ（dB）・高さ（Hz）・長さを、音節の間で比べる（最後の音節は伸びやすいので長さを割り引く）
      const z = (arr) => { const m = arr.reduce((a, b) => a + b, 0) / arr.length; const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length) || 1; return arr.map((v) => (v - m) / sd); };
      const W = TH.stressW;
      const zp = z(syl.map((x, k) => x.peak + W.energySlope * k));
      const voiced = syl.filter((x) => x.f0 > 0).length === syl.length;
      const zf = voiced ? z(syl.map((x, k) => Math.log(x.f0) + W.pitchSlope * k)) : syl.map(() => 0);
      const zd = z(syl.map((x, k) => Math.log(x.frames * (k === syl.length - 1 ? W.finalLen : 1))));
      const sc = syl.map((_, k) => W.energy * zp[k] + (voiced ? W.pitch : 0) * zf[k] + W.length * zd[k]);
      const order = sc.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]);
      const clear = order[0][0] - order[1][0] >= TH.stressMargin;
      stressRes = { expected: stress, detected: clear ? order[0][1] : null, ok: clear ? order[0][1] === stress : null };
    }
    const counts = { good: 0, fair: 0, bad: 0 }; syl.forEach((x) => { counts[x.verdict] += 1; });
    return { phones: res, insertions, syllables: syl, stress: stressRes, heard: heardAll, lowSignal: heardAll.length < Math.ceil(phones.length / 3), counts, ll: LL0 / T };
  }

  // 声の高さ（Hz）：自己相関で 70〜400Hz の周期を探す。声になっていない部分は 0
  function pitch(pcm, from, len) {
    const end = Math.min(pcm.length, from + len);
    if (end - from < 400) return 0;
    let e0 = 0; for (let i = from; i < end; i++) e0 += pcm[i] * pcm[i];
    if (e0 < 1e-6) return 0;
    let best = 0, lag = 0;
    for (let L = 40; L <= 228; L++) { // 400Hz〜70Hz
      let s = 0; for (let i = from; i + L < end; i++) s += pcm[i] * pcm[i + L];
      const r = s / e0;
      if (r > best) { best = r; lag = L; }
    }
    return best > 0.45 ? 16000 / lag : 0;
  }
  // 声の大きさ（20ミリ秒ごと・dB）
  function energyDb(pcm, T) {
    const out = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      let s = 0, n = 0;
      for (let i = t * 320; i < Math.min(pcm.length, t * 320 + 400); i++) { s += pcm[i] * pcm[i]; n++; }
      out[t] = 10 * Math.log10((n ? s / n : 0) + 1e-10);
    }
    return out;
  }
  // 前後の無音を切る（声のある部分の前後0.25秒を残す）。全部無音なら null
  function trim(pcm) {
    const W = 320, n = Math.floor(pcm.length / W), db = [];
    for (let k = 0; k < n; k++) { let s = 0; for (let i = k * W; i < (k + 1) * W; i++) s += pcm[i] * pcm[i]; db.push(10 * Math.log10(s / W + 1e-10)); }
    if (!db.length) return null;
    const max = Math.max(...db);
    if (max < -50) return null; // ほぼ無音
    const thr = max - 30;
    let a = db.findIndex((x) => x > thr), b = db.length - 1 - [...db].reverse().findIndex((x) => x > thr);
    a = Math.max(0, a - 12); b = Math.min(n - 1, b + 12);
    return pcm.slice(a * W, (b + 1) * W);
  }
  // 平均0・分散1にそろえる（モデルの入力の形）
  function normalize(pcm) {
    let m = 0; for (const v of pcm) m += v; m /= pcm.length;
    let s = 0; for (const v of pcm) s += (v - m) ** 2; s = Math.sqrt(s / pcm.length) + 1e-7;
    const out = new Float32Array(pcm.length); for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] - m) / s;
    return out;
  }

  return { VOCAB, VOWELS, TH, score, energyDb, trim, normalize, ctcLL, logSoftmax, greedy };
})();
if (typeof self !== 'undefined') self.GOP = GOP;
