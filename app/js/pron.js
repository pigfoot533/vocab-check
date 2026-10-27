// 発音記号・音節・強勢
// 辞書：CMU Pronouncing Dictionary（BSD）＋ Moby Hyphenator II（パブリックドメイン）から作った dict/pron/*.txt
const Pron = (() => {
  const cache = new Map();
  function loadLetter(l) {
    if (cache.has(l)) return cache.get(l);
    const p = (async () => {
      let r;
      try { r = await fetch(`dict/pron/${l}.txt`); } catch { throw new Error('発音データを読み込めませんでした（start.bat から起動しているか確認してください）。'); }
      if (!r.ok) throw new Error('発音データが見つかりません（dict/pron フォルダを確認してください）。');
      const map = new Map();
      // 大きなファイルなので、3000行ごとに画面に処理を返す（読み込みのあいだも画面が止まらないように）
      const lines = (await r.text()).split('\n');
      for (let n = 0; n < lines.length; n++) {
        if (n && n % 3000 === 0) await new Promise((res) => setTimeout(res, 0));
        const [w, divs, prons] = lines[n].split('\t');
        if (!w || !prons) continue;
        map.set(w, { divs: divs ? divs.split('/').map((d) => d.split('·')) : [], prons: prons.split(';') });
      }
      return map;
    })();
    cache.set(l, p);
    p.catch(() => cache.delete(l));
    return p;
  }

  // ---- ARPAbet → IPA（米音） ----
  const V = { AA: 'ɑ', AE: 'æ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', EY: 'eɪ', IH: 'ɪ', IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u' };
  const C = { B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ' };
  // 音節の頭に来られる子音のまとまり（強勢記号を置く位置を決めるため）
  const ONSETS = new Set(['P R', 'B R', 'T R', 'D R', 'K R', 'G R', 'F R', 'TH R', 'SH R', 'P L', 'B L', 'K L', 'G L', 'F L', 'S L', 'S P', 'S T', 'S K', 'S M', 'S N', 'S W', 'T W', 'D W', 'K W', 'G W', 'TH W', 'P Y', 'B Y', 'F Y', 'K Y', 'M Y', 'V Y', 'HH Y', 'G Y', 'S P R', 'S T R', 'S K R', 'S P L', 'S K W', 'S P Y', 'S K Y']);
  const isVowel = (ph) => /\d$/.test(ph);
  const vowelIPA = (ph) => {
    const base = ph.replace(/\d$/, ''), s = ph.slice(-1);
    if (base === 'AH') return s === '0' ? 'ə' : 'ʌ';
    if (base === 'ER') return s === '0' ? 'ɚ' : 'ɝ';
    return V[base] || '';
  };
  function parse(pron) {
    const ph = pron.trim().split(/\s+/);
    const vowels = [];
    ph.forEach((p, i) => { if (isVowel(p)) vowels.push(i); });
    // 第1強勢が2つある語（engineer, outspoken, downtown など約1500語）は、後ろの方をいちばん強く読むことが多いので後ろを採り、前は第2強勢にする
    const ones = vowels.map((i, k) => (ph[i].endsWith('1') ? k : -1)).filter((k) => k >= 0);
    const primary = ones.length ? ones[ones.length - 1] : -1;
    ones.slice(0, -1).forEach((k) => { ph[vowels[k]] = ph[vowels[k]].replace(/1$/, '2'); });
    return { ph, vowels, n: vowels.length, primary };
  }
  // ---- 発音を音節に分ける（最大頭子音原則：母音の間の子音は、英語の語頭に来られる限り後ろの音節に付ける） ----
  function sylStarts({ ph, vowels }) {
    return vowels.map((vi, k) => {
      if (k === 0) return 0;
      const prev = vowels[k - 1];
      let s = vi;
      for (let j = vi - 1; j > prev; j--) {
        const cluster = ph.slice(j, vi).join(' ');
        if (vi - j === 1 ? ph[j] !== 'NG' : ONSETS.has(cluster)) s = j; else break;
      }
      return s;
    });
  }
  // 音節ごとの発音記号を「.」でつなぎ、強く読む音節の前に ˈ を付ける（例：/ˈstrɔ.bɛ.ri/）
  function toIPA(p) {
    const starts = sylStarts(p);
    const parts = starts.map((s, k) => p.ph.slice(s, starts[k + 1] ?? p.ph.length).map((x) => (isVowel(x) ? vowelIPA(x) : (C[x] || ''))).join(''));
    let out = '';
    parts.forEach((t, k) => {
      const primary = p.ph[p.vowels[k]].endsWith('1');
      if (p.n > 1 && primary) out += 'ˈ';
      else if (k > 0) out += '.';
      out += t;
    });
    return `/${out}/`;
  }

  // ---- 綴りと発音の対応づけ（どの文字がどの音か） ----
  // 音ごとに、よく使われる綴り。ここにない組み合わせも、少し高い「費用」で対応づけられる
  const GR = {
    AA: ['a', 'o', 'au', 'aw', 'ah', 'al', 'ow', 'ho'], AE: ['a', 'ai', 'au', 'al'], AH: ['a', 'e', 'i', 'o', 'u', 'ou', 'oo', 'io', 'ia', 'ai', 'y', 'eo', 'oe', 'ei', 'ea'],
    AO: ['o', 'a', 'au', 'aw', 'augh', 'ough', 'oa', 'oo', 'al', 'ou', 'oar'], AW: ['ou', 'ow', 'ough', 'au'], AY: ['i', 'y', 'ie', 'igh', 'ei', 'ai', 'uy', 'eye', 'ye', 'ui', 'is', 'ey'],
    EH: ['e', 'ea', 'a', 'ai', 'ie', 'ue', 'ei', 'eo', 'ay'], ER: ['er', 'ir', 'ur', 'or', 'ar', 'ear', 'our', 'yr', 're', 'err', 'urr', 'ere', 'eur', 'rr', 'r', 'irr', 'orr', 'arr'],
    EY: ['a', 'ai', 'ay', 'ei', 'ey', 'ea', 'eigh', 'aigh', 'e', 'au', 'et'], IH: ['i', 'y', 'e', 'ui', 'u', 'ee', 'ie', 'a', 'o', 'ea', 'ai'], IY: ['e', 'ee', 'ea', 'y', 'ie', 'ei', 'i', 'ey', 'ae', 'eo', 'oe', 'ay'],
    OW: ['o', 'oa', 'ow', 'oe', 'ough', 'ou', 'eau', 'ew', 'au', 'oh', 'eo'], OY: ['oi', 'oy', 'uoy'], UH: ['oo', 'u', 'ou', 'o', 'oul'], UW: ['oo', 'u', 'ew', 'ue', 'ou', 'o', 'ui', 'eu', 'oe', 'ough', 'wo', 'eau'],
    B: ['b', 'bb'], CH: ['ch', 'tch', 't', 'c', 'cz', 'ti'], D: ['d', 'dd', 'ed', 'de', 'ld'], DH: ['th', 'the'], F: ['f', 'ff', 'ph', 'gh', 'fe', 'pph'], G: ['g', 'gg', 'gu', 'gh', 'gue', 'x'],
    HH: ['h', 'wh', 'j'], JH: ['j', 'g', 'dg', 'dge', 'ge', 'gi', 'd', 'gg', 'di'], K: ['k', 'c', 'ck', 'ch', 'q', 'cc', 'kh', 'qu', 'que', 'cq', 'ke', 'lk', 'x'], L: ['l', 'll', 'le', 'lle'],
    M: ['m', 'mm', 'mb', 'mn', 'me', 'lm'], N: ['n', 'nn', 'kn', 'gn', 'pn', 'ne', 'mn'], NG: ['ng', 'n', 'ngue'], P: ['p', 'pp', 'pe'], R: ['r', 'rr', 'wr', 'rh', 're'],
    S: ['s', 'ss', 'c', 'sc', 'ce', 'se', 'ps', 'st', 'sw', 'z'], SH: ['sh', 'ti', 'ci', 's', 'ss', 'ch', 'si', 'sci', 'ce', 'sch', 'ssi', 'xi'], T: ['t', 'tt', 'ed', 'th', 'pt', 'bt', 'te', 'cht'],
    TH: ['th'], V: ['v', 'f', 've', 'vv', 'ph'], W: ['w', 'u', 'wh', 'o'], Y: ['y', 'i', 'j', 'e'], Z: ['z', 's', 'zz', 'x', 'ss', 'se', 'ze', 'es'], ZH: ['s', 'g', 'si', 'z', 'ge', 'ti', 'zi'],
  };
  // 1つの綴りで2つ以上の音になるもの
  const MULTI = {
    x: [['K', 'S'], ['G', 'Z'], ['K', 'SH']], u: [['Y', 'UW'], ['Y', 'AH'], ['Y', 'UH'], ['Y', 'ER'], ['AH', 'W'], ['UW', 'W'], ['Y', 'UW', 'W'], ['Y', 'AH', 'W']], // graduate, usual
    ue: [['Y', 'UW'], ['UW', 'AH']], gn: [['N', 'Y']], ew: [['Y', 'UW']], eu: [['Y', 'UW']], eau: [['Y', 'UW']],
    qu: [['K', 'W']], o: [['W', 'AH']], ui: [['W', 'IH']], le: [['AH', 'L']], el: [['AH', 'L']], re: [['ER']], i: [['Y', 'AH'], ['IY', 'AH'], ['Y', 'IH']], ia: [['IY', 'AH']], io: [['IY', 'OW'], ['IY', 'AH']], ism: [['IH', 'Z', 'AH', 'M']], sm: [['Z', 'AH', 'M']], ire: [['AY', 'ER']], our: [['AW', 'ER']],
    m: [['AH', 'M']], n: [['AH', 'N']], l: [['AH', 'L']], // 母音を伴って読む子音（rhythm, prism など）
    ua: [['Y', 'AH', 'W', 'EH'], ['Y', 'UW', 'EH'], ['W', 'EH']], // february, january
  };
  const VOWEL_PH = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
  const silentCost = (L, i) => {
    const c = L[i];
    if (!/[a-z]/.test(c)) return 0;
    if (c === 'e') return i === L.length - 1 ? 0.2 : 0.6;
    if ('hw'.includes(c)) return 0.8;
    if ('bkgtulpnds'.includes(c)) return 1.2;
    return /[aeiouy]/.test(c) ? 1.5 : 2.5;
  };
  // 文字と音の対応（各音が、綴りのどこから始まるか）を、費用がいちばん小さくなるように求める
  function align(word, ph) {
    const L = word.toLowerCase(), P = ph.map((x) => x.replace(/\d$/, ''));
    const n = L.length, m = P.length;
    const INF = 1e9;
    const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
    const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
    cost[0][0] = 0;
    const relax = (i, j, i2, j2, c) => { const v = cost[i][j] + c; if (v < cost[i2][j2]) { cost[i2][j2] = v; back[i2][j2] = [i, j]; } };
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= m; j++) {
        if (cost[i][j] >= INF) continue;
        if (i < n) relax(i, j, i + 1, j, silentCost(L, i));
        if (j >= m || i >= n) continue;
        for (const g of GR[P[j]] || []) if (L.startsWith(g, i)) relax(i, j, i + g.length, j + 1, 0.02 * g.length);
        for (const g of Object.keys(MULTI)) {
          if (!L.startsWith(g, i)) continue;
          for (const seq of MULTI[g]) if (seq.every((s, k) => P[j + k] === s)) relax(i, j, i + g.length, j + seq.length, 0.3);
        }
        const vl = /[aeiouy]/.test(L[i]), vp = VOWEL_PH.has(P[j]);
        relax(i, j, i + 1, j + 1, vl && vp ? 2 : vl !== vp ? 6 : 4);
      }
    }
    if (cost[n][m] >= INF) return null;
    // 戻りながら、各音の綴りの範囲を記録
    const spans = new Array(m);
    let i = n, j = m;
    while (i > 0 || j > 0) {
      const [pi, pj] = back[i][j];
      for (let k = pj; k < j; k++) spans[k] = { start: pi, end: i, group: pj };
      i = pi; j = pj;
    }
    return { spans, cost: cost[n][m] };
  }
  // 発音の音節の区切りを、綴りの上に当てはめる（例：S T R AO1 | B EH2 | R IY0 → straw·ber·ry）
  function spellSyllables(word, p) {
    const starts = sylStarts(p);
    if (starts.length === 1) return { syllables: [word], ok: true };
    const al = align(word, p.ph);
    if (!al || al.cost > 4 + word.length * 0.4) return { syllables: [], ok: false };
    const cuts = [];
    for (let k = 1; k < starts.length; k++) {
      const sp = al.spans[starts[k]];
      let cut = sp.start;
      const g = word.slice(sp.start, sp.end).toLowerCase();
      if (sp.group < starts[k]) {
        // 前の音と同じ文字のまとまりで表される音：1文字（x など）なら前の音節へ、2文字以上（ua など）なら文字の間で分ける
        cut = sp.end - sp.start >= 2 ? sp.start + Math.min(sp.end - sp.start - 1, starts[k] - sp.group) : sp.end;
      }
      else if (g.length === 2 && g[0] === g[1] && !/[aeiou]/.test(g[0])) cut = sp.start + 1; // 重なった子音（rr, tt など）は間で分ける
      cuts.push(cut);
    }
    const all = [0, ...cuts, word.length];
    for (let k = 1; k < all.length; k++) if (all[k] <= all[k - 1]) return { syllables: [], ok: false };
    return { syllables: all.slice(0, -1).map((s, k) => word.slice(s, all[k + 1])), ok: true };
  }

  // 1つの発音（ARPAbet）から、音節・強勢・発音記号をまとめて作る
  function fromPron(word, pron, src) {
    const p = parse(pron);
    if (!p.n) return null;
    const sp = spellSyllables(word, p);
    const starts = sylStarts(p);
    return {
      ipa: toIPA(p), syllables: sp.syllables, stress: sp.ok ? Math.max(0, p.primary) : null,
      phon: { phones: p.ph, starts, src }, n: p.n, primary: p.primary, ok: sp.ok,
    };
  }

  async function prons(w) {
    const entry = (await loadLetter(w[0])).get(w);
    return entry ? entry.prons : null;
  }

  // 辞書（なければ推定）から、発音記号・音節・強勢を作る
  // イディオム（2語以上）：1語ずつの発音をつなげる。「～」「A」「B」などの置きかえる部分は読まない。
  // 音節・強勢は1語の単語のためのものなので入れない（空にする）。どれか1語でも発音がわからなければ null
  async function analyzePhrase(raw) {
    // 「speak to / speak with」は最初の形、「here is [are]」は is の形で読む。記号だけのもの（? / など）は読まない
    const first = U.phraseVariants(raw)[0] || raw;
    const toks = first.replace(/[()]/g, ' ').split(/\s+/).map((t) => t.replace(/^[?!.,;:]+|[?!.,;:]+$/g, '')).filter((t) => t && /[A-Za-z]/.test(t) && !U.PLACEHOLDER.test(t));
    if (!toks.length || toks.length > 8) return null;
    const ipas = [], phones = [], starts = [];
    let g2p = false;
    for (const t of toks) {
      const r = await analyze(t.replace(/[.,!?;:]+$/, ''));
      if (!r || !r.ipa || !r.phon) return null;
      if (r.src === 'g2p') g2p = true;
      ipas.push(r.ipa.replace(/^\/|\/$/g, ''));
      const off = phones.length;
      phones.push(...r.phon.phones);
      starts.push(...r.phon.starts.map((x) => x + off));
    }
    return {
      ipa: `/${ipas.join(' ')}/`, syllables: [], stress: null, phon: { phones, starts, src: g2p ? 'g2p' : 'dict' }, variants: [],
      note: 'イディオムは、1語ずつの発音をつないでいます（音節・強勢は入れません）。', src: g2p ? 'g2p' : 'dict', phrase: true,
    };
  }

  async function analyze(word) {
    const raw = String(word || '').normalize('NFKC').trim();
    if (/\s/.test(raw)) return analyzePhrase(raw);
    const w = raw.toLowerCase();
    if (!/^[a-z][a-z'-]*$/.test(w)) return null;
    let list = await prons(w);
    let src = 'dict';
    if (!list && typeof G2P !== 'undefined') {
      const g = await G2P.guess(w, prons);
      if (g) { list = [g.pron]; src = 'g2p'; }
    }
    if (!list) return null;
    const all = list.map((pr) => fromPron(w, pr, src)).filter(Boolean);
    if (!all.length) return null;
    const main = all[0];
    const res = { ipa: main.ipa, syllables: main.syllables, stress: main.stress, phon: main.phon, variants: [], note: '', src };
    if (src === 'g2p') res.note = '辞書にない語のため、発音・音節・強勢は綴りから推定しました（まちがっていることがあります）。';
    else if (!main.ok) res.note = '綴りと発音をうまく対応づけられなかったため、音節と強勢は空欄にしました（発音記号は入れています）。';

    // 強く読む場所が違う発音（同じ音節数で、強勢の位置が違うもの）を探す
    const seen = new Set();
    const sameN = all.filter((x) => x.n === main.n && x.primary >= 0 && x.ok && !seen.has(x.primary) && seen.add(x.primary));
    // 使い方で強勢が変わる語は 2〜3音節のもの（record, present など）。長い語の別の発音は方言などの違いなので対象にしない
    if (src === 'dict' && sameN.length >= 2 && main.n <= 3) {
      sameN.sort((a, b) => a.primary - b.primary);
      res.variants = sameN.slice(0, 3).map((x) => ({ pos: '', meaning: '', example: '', exampleJa: '', syllables: x.syllables, stress: x.stress, ipa: x.ipa, src: 'dict' }));
    }
    return res;
  }

  // 強勢の位置を言葉で（例：第1音節を強く読む）
  const stressText = (syl, stress) => (syl && syl.length > 1 && stress != null ? `第${stress + 1}音節を強く読む` : '');

  // 以前の方式（綴りの区切り）で入れた単語を、発音の音節に入れ替える（自分で直した・AIで入れた単語は変えない）
  async function ensure(word) {
    const s = (word.infoSource || {}).pron || '';
    if (word.phon || ['user', 'gemini', 'claude', 'gemini-checked', 'claude-checked'].includes(s)) return false;
    if (s === '' && (word.syllables || []).length && !word.sample) return false; // 本人が登録時に入れたもの
    let r;
    try { r = await analyze(word.word); } catch { return false; }
    if (!r || !r.syllables.length) return false;
    word.ipa = r.ipa; word.syllables = r.syllables; word.stress = r.stress; word.phon = r.phon;
    if (!(word.stressVariants || []).length && r.variants.length >= 2) word.stressVariants = r.variants;
    word.infoSource = { ...(word.infoSource || {}), pron: r.src === 'g2p' ? 'g2p' : 'dict' };
    return true;
  }

  // ---- 表示 ----
  const POS_HINT = { 名詞: 'もの・こと', 動詞: 'すること', 形容詞: 'ようす', 副詞: 'ようす' };
  function sylHtml(syl, stress) {
    return `<span class="syl">${syl.map((s, i) => `<span class="${i === stress ? 'stress' : ''}">${U.esc(s)}</span>`).join('<span aria-hidden="true" style="background:none;padding:0">·</span>')}</span>`;
  }
  const upperStress = (syl, stress) => syl.map((s, i) => (i === stress ? s.toUpperCase() : s)).join('-');
  // 例文の中の単語を目立たせ、綴りがそのまま出ていれば強く読む音節に色を付ける
  function exampleHtml(word, v) {
    if (!v.example) return '';
    const b = Quiz.findBlank({ word, examples: [{ en: v.example }] });
    if (!b) return U.esc(v.example);
    const sameForm = b.form.toLowerCase() === word.toLowerCase() && v.syllables.join('').toLowerCase() === word.toLowerCase();
    let inner = `<strong>${U.esc(b.form)}</strong>`;
    if (sameForm) {
      let pos = 0;
      inner = `<strong>${v.syllables.map((s, i) => { const part = b.form.slice(pos, pos + s.length); pos += s.length; return i === v.stress ? `<span class="stress-mark">${U.esc(part)}</span>` : U.esc(part); }).join('')}</strong>`;
    }
    return `${U.esc(b.before)}${inner}${U.esc(b.after)}`;
  }
  function label(v, i, shs) {
    const hint = POS_HINT[(v.pos || '').split('・')[0]];
    const main = v.meaning ? `${U.esc(v.meaning)}${hint ? `（${hint}）` : ''}` : (i === 0 ? '前のほうを強く読む使い方' : '後ろのほうを強く読む使い方');
    return `${main}${shs && v.pos ? ` <span class="chip">${U.esc(v.pos)}</span>` : ''}`;
  }
  // 使い方によって強く読む場所が変わる単語の説明（学習レベルで表示を変える）
  function variantsHtml(w, level, { withAudio = true } = {}) {
    const vs = (w.stressVariants || []).filter((v) => v.syllables && v.syllables.length && v.stress != null);
    if (vs.length < 2) return '';
    const shs = level === 'shs';
    return `<div class="stress-shift">
      <div class="title">この単語は、使い方によって強く読む場所が変わります</div>
      ${vs.map((v, i) => `<div class="sv">
        <div>${label(v, i, shs)} → <span class="en"><strong>${U.esc(upperStress(v.syllables, v.stress))}</strong></span> ${v.ipa ? `<span class="ipa">${U.esc(v.ipa)}</span>` : ''}</div>
        <div class="mt">${sylHtml(v.syllables, v.stress)}</div>
        ${v.example ? `<div class="ex"><div class="e">${exampleHtml(w.word, v)} ${withAudio ? `<button type="button" class="btn small ghost" data-speak="${U.esc(v.example)}" aria-label="例文を再生">🔊</button>` : ''}</div>${v.exampleJa ? `<div class="j">${U.esc(v.exampleJa)}</div>` : ''}</div>` : ''}
      </div>`).join('')}
      ${vs.some((v) => !v.meaning) ? '<p class="small muted mb0">それぞれの意味や例文は、編集画面の「Geminiで発音を調べる」で入れるか、自分で入力できます。</p>' : ''}
      ${shs ? '<p class="small mb0">傾向：2音節の語では、<strong>名詞・形容詞は前</strong>、<strong>動詞は後ろ</strong>を強く読むことが多い（record, present, object など）。ただし例外もあります（例：名詞でも後ろを強く読む report, control）。</p>' : ''}
      ${withAudio ? '<p class="small muted mb0">※合成音声は、強く読む場所の違いを正しく読み分けないことがあります。色の付いた音節を強く読むことを目で確認してください。</p>' : ''}
    </div>`;
  }

  async function has(word) {
    const w = String(word || '').toLowerCase();
    if (!/^[a-z]/.test(w)) return false;
    return (await loadLetter(w[0])).has(w);
  }
  const validVariants = (w) => (w.stressVariants || []).filter((v) => v.syllables && v.syllables.length && v.stress != null);
  return { analyze, toIPA, parse, sylHtml, variantsHtml, exampleHtml, upperStress, label, validVariants, has, align, spellSyllables, sylStarts, fromPron, prons, stressText, ensure };
})();
