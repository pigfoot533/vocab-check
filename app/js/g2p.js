// 辞書（CMU）にない単語の発音を、ブラウザの中で推定する（G2P：綴り → 発音）
// 1) 辞書の語の変化形・派生語（-s, -ed, -ing, -ness, un- など）→ 辞書の発音に語尾を付ける
// 2) 辞書の語2つをつなげた複合語 → 2つの発音をつなげる
// 3) それ以外 → 綴りと音の規則で推定し、強勢の位置も規則で決める
// どれも「推定」なので、画面では推定であることを表示する
const G2P = (() => {
  const VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH']);
  const SIBIL = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);
  const lastPh = (pr) => pr.trim().split(/\s+/).pop().replace(/\d$/, '');
  const firstOf = async (get, w) => { if (!w || w.length < 2) return null; try { const l = await get(w); return l ? l[0] : null; } catch { return null; } };

  // 1) 変化形・派生語（depth：接頭辞・接尾辞を重ねて外す回数。un + friend + ed など）
  async function fromAffix(w, get, depth = 1) {
    const tries = [];
    const add = (base, f) => tries.push([base, f]);
    const plural = (pr) => `${pr} ${SIBIL.has(lastPh(pr)) ? 'IH0 Z' : VOICELESS.has(lastPh(pr)) ? 'S' : 'Z'}`;
    const past = (pr) => { const l = lastPh(pr); return `${pr} ${l === 'T' || l === 'D' ? 'IH0 D' : VOICELESS.has(l) || ['S', 'SH', 'CH'].includes(l) ? 'T' : 'D'}`; };
    if (/ies$/.test(w)) add(`${w.slice(0, -3)}y`, plural);
    if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0, -1), plural);
    if (/es$/.test(w)) add(w.slice(0, -2), plural);
    if (/ves$/.test(w)) add(`${w.slice(0, -3)}f`, (pr) => `${pr.replace(/F$/, 'V')} Z`);
    if (/ied$/.test(w)) add(`${w.slice(0, -3)}y`, past);
    if (/ed$/.test(w)) { add(w.slice(0, -2), past); add(w.slice(0, -1), past); if (/([^aeiou])\1ed$/.test(w)) add(w.slice(0, -3), past); }
    if (/ing$/.test(w)) {
      const b = w.slice(0, -3), ing = (pr) => `${pr} IH0 NG`;
      add(b, ing); add(`${b}e`, ing);
      if (/([^aeiou])\1$/.test(b)) add(b.slice(0, -1), ing);
    }
    const SUF = [['ness', 'N AH0 S'], ['ful', 'F AH0 L'], ['less', 'L AH0 S'], ['ment', 'M AH0 N T'], ['ly', 'L IY0'], ['er', 'ER0'], ['est', 'AH0 S T'],
      ['able', 'AH0 B AH0 L'], ['ish', 'IH0 SH'], ['ism', 'IH0 Z AH0 M'], ['ist', 'IH0 S T'], ['ship', 'SH IH2 P'], ['hood', 'HH UH2 D'], ['like', 'L AY2 K'], ['wise', 'W AY2 Z']];
    for (const [s, ph] of SUF) {
      if (!w.endsWith(s) || w.length < s.length + 3) continue;
      const b = w.slice(0, -s.length), f = (pr) => `${pr} ${ph}`;
      add(b, f);
      if (/i$/.test(b)) add(`${b.slice(0, -1)}y`, f);
      add(`${b}e`, f);
    }
    const PRE = [['un', 'AH0 N'], ['re', 'R IY0'], ['dis', 'D IH0 S'], ['mis', 'M IH0 S'], ['pre', 'P R IY0'], ['non', 'N AA2 N'], ['over', 'OW2 V ER0'], ['under', 'AH2 N D ER0'], ['out', 'AW2 T'], ['in', 'IH0 N'], ['im', 'IH0 M']];
    for (const [p, ph] of PRE) if (w.startsWith(p) && w.length > p.length + 3) add(w.slice(p.length), (pr) => `${ph} ${pr}`);
    for (const [b, f] of tries) { const pr = await firstOf(get, b); if (pr) return f(pr); }
    if (depth > 0) for (const [b, f] of tries) { if (b.length < 4) continue; const pr = await fromAffix(b, get, depth - 1); if (pr) return f(pr); }
    return null;
  }

  // 2) 複合語（後ろの語の強勢は弱める）
  async function fromCompound(w, get) {
    for (let k = 3; k <= w.length - 3; k++) {
      const pa = await firstOf(get, w.slice(0, k));
      if (!pa) continue;
      const pb = await firstOf(get, w.slice(k));
      if (pb) return `${pa} ${pb.replace(/1/g, '2')}`;
    }
    return null;
  }

  // 3) 綴りと音の規則
  const isV = (c) => /[aeiou]/.test(c || '');
  const SHORT = { a: 'AE', e: 'EH', i: 'IH', o: 'AA', u: 'AH', y: 'IH' };
  const LONG = { a: 'EY', e: 'IY', i: 'AY', o: 'OW', u: 'UW', y: 'AY' };
  const TEAMS = [['eigh', ['EY']], ['augh', ['AO']], ['ough', ['AO']], ['igh', ['AY']], ['eau', ['OW']], ['ee', ['IY']], ['ea', ['IY']], ['ai', ['EY']], ['ay', ['EY']], ['oa', ['OW']],
    ['oo', ['UW']], ['ou', ['AW']], ['oi', ['OY']], ['oy', ['OY']], ['au', ['AO']], ['aw', ['AO']], ['ew', ['UW']], ['ei', ['IY']], ['ey', ['IY']], ['ie', ['IY']], ['ue', ['UW']], ['ui', ['UW']]];
  const CONS = [['tch', ['CH']], ['dge', ['JH']], ['sch', ['S', 'K']], ['ph', ['F']], ['sh', ['SH']], ['ch', ['CH']], ['th', ['TH']], ['wh', ['W']], ['ck', ['K']], ['ng', ['NG']], ['qu', ['K', 'W']], ['gh', []]];
  function rules(w) {
    const out = []; // [phone, isVowel]
    const vowelGroups = (w.match(/[aeiouy]+/g) || []).length;
    let i = 0;
    const n = w.length;
    const push = (...ps) => ps.forEach((p) => out.push(p));
    while (i < n) {
      const rest = w.slice(i), prev = w[i - 1] || '', c = w[i], nx = w[i + 1] || '';
      // 語尾・まとまり
      if (rest.startsWith('tion')) { push('SH', 'AH', 'N'); i += 4; continue; }
      if (rest.startsWith('sion')) { push(isV(prev) ? 'ZH' : 'SH', 'AH', 'N'); i += 4; continue; }
      if (rest.startsWith('ture')) { push('CH', 'ER'); i += 4; continue; }
      if (/^(cious|tious)/.test(rest)) { push('SH', 'AH', 'S'); i += 5; continue; }
      if (rest === 'ous') { push('AH', 'S'); i += 3; continue; }
      if (rest === 'le' && i > 0 && !isV(prev)) { push('AH', 'L'); i += 2; continue; }
      if (rest === 'e' && vowelGroups > 1) { i += 1; continue; } // 語末の e は読まない
      if (rest === 'y' && i > 0) { push(vowelGroups > 1 ? 'IY' : 'AY'); i += 1; continue; }
      if (i === 0 && rest.startsWith('kn')) { push('N'); i += 2; continue; }
      if (i === 0 && rest.startsWith('wr')) { push('R'); i += 2; continue; }
      if (rest === 'mb') { push('M'); i += 2; continue; }
      // r の付く母音
      const rv = rest.match(/^(ar|er|ir|ur|or)(?![aeiou])/);
      if (rv) { push(rv[1] === 'ar' ? 'AA' : rv[1] === 'or' ? 'AO' : 'ER'); if (rv[1] === 'ar' || rv[1] === 'or') push('R'); i += 2; continue; }
      // 母音のまとまり
      const team = TEAMS.find(([g]) => rest.startsWith(g));
      if (team) { push(...team[1]); i += team[0].length; continue; }
      const cons = CONS.find(([g]) => rest.startsWith(g));
      if (cons) { push(...cons[1]); i += cons[0].length; continue; }
      if (isV(c) || (c === 'y' && i > 0)) {
        // 母音＋子音1つ＋e（語末）→ 長い母音（make, time など）
        const magic = /^[aeiouy][^aeiouy]e(s|d)?$/.test(rest) && vowelGroups > 0;
        push(magic ? LONG[c] : SHORT[c]);
        i += 1; continue;
      }
      if (c === 'y') { push('Y'); i += 1; continue; }
      if (c === nx && !isV(c)) { i += 1; continue; } // 重なった子音は1つ
      if (c === 'c') { push(/[eiy]/.test(nx) ? 'S' : 'K'); i += 1; continue; }
      if (c === 'g') { push(/[eiy]/.test(nx) ? 'JH' : 'G'); i += 1; continue; }
      if (c === 'x') { push('K', 'S'); i += 1; continue; }
      if (c === 's') { push(isV(prev) && isV(nx) ? 'Z' : 'S'); i += 1; continue; }
      const map = { b: 'B', d: 'D', f: 'F', h: 'HH', j: 'JH', k: 'K', l: 'L', m: 'M', n: 'N', p: 'P', q: 'K', r: 'R', t: 'T', v: 'V', w: 'W', z: 'Z' };
      if (map[c]) push(map[c]);
      i += 1;
    }
    // 強勢の位置（規則による目安）
    const VOW = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
    const vIdx = out.map((p, k) => (VOW.has(p) ? k : -1)).filter((k) => k >= 0);
    if (!vIdx.length) return null;
    const nv = vIdx.length;
    let st = 0;
    if (/(tion|sion|cian|cial|tial|cious|tious|ic|ian|ial)$/.test(w)) st = Math.max(0, nv - 2);
    else if (/(ity|ical|ogy|graphy|ify|ious)$/.test(w)) st = Math.max(0, nv - 3);
    else if (/(ee|eer|ese|ique|oon)$/.test(w)) st = nv - 1;
    else if (nv >= 4) st = nv - 3;
    // 強勢のない短い母音は弱く（ə）
    return out.map((p, k) => {
      if (!VOW.has(p)) return p;
      const vi = vIdx.indexOf(k);
      if (vi === st) return `${p}1`;
      return ['AE', 'EH', 'AA', 'AH'].includes(p) ? 'AH0' : `${p}0`;
    }).join(' ');
  }

  async function guess(word, get) {
    const w = String(word || '').toLowerCase();
    if (!/^[a-z]{2,}$/.test(w.replace(/['-]/g, ''))) return null;
    const plain = w.replace(/['-]/g, '');
    if (w.includes('-')) {
      // ハイフンでつながった語は、それぞれの発音をつなげる
      const parts = w.split('-').filter(Boolean);
      const ps = [];
      for (const p of parts) { const pr = (await firstOf(get, p)) || (await fromAffix(p, get)) || rules(p); if (!pr) return null; ps.push(ps.length ? pr.replace(/1/g, '2') : pr); }
      return { pron: ps.join(' '), how: 'parts' };
    }
    const a = await fromAffix(plain, get);
    if (a) return { pron: a, how: 'affix' };
    const c = await fromCompound(plain, get);
    if (c) return { pron: c, how: 'compound' };
    const r = rules(plain);
    return r ? { pron: r, how: 'rules' } : null;
  }

  return { guess, rules };
})();
