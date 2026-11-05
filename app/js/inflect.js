// 穴うめ問題の選択肢を、例文の形（過去形・複数形など）にそろえるための小さな道具
// ・品詞は、単語シートの「意味」から推定する（「〜する」「〜く」などで終われば動詞、名詞らしければ名詞）
// ・例文の空欄の語と、もとの単語を比べて、どの形か（過去形・-ing・三単現/複数形など）を調べる
// ・ほかの選択肢も、同じ品詞なら同じ形に変える（正解が過去形なら、ほかの動詞も過去形に）
const Inflect = (() => {
  // 不規則動詞：原形 → [過去形, 過去分詞]
  const IRR = {
    be: ['was', 'been'], arise: ['arose', 'arisen'], bear: ['bore', 'born'], beat: ['beat', 'beaten'], become: ['became', 'become'],
    begin: ['began', 'begun'], bend: ['bent', 'bent'], bet: ['bet', 'bet'], bind: ['bound', 'bound'], bite: ['bit', 'bitten'],
    bleed: ['bled', 'bled'], blow: ['blew', 'blown'], break: ['broke', 'broken'], bring: ['brought', 'brought'], build: ['built', 'built'],
    burn: ['burned', 'burned'], buy: ['bought', 'bought'], cast: ['cast', 'cast'], catch: ['caught', 'caught'], choose: ['chose', 'chosen'],
    come: ['came', 'come'], cost: ['cost', 'cost'], creep: ['crept', 'crept'], cut: ['cut', 'cut'], deal: ['dealt', 'dealt'],
    dig: ['dug', 'dug'], do: ['did', 'done'], draw: ['drew', 'drawn'], dream: ['dreamed', 'dreamed'], drink: ['drank', 'drunk'],
    drive: ['drove', 'driven'], eat: ['ate', 'eaten'], fall: ['fell', 'fallen'], feed: ['fed', 'fed'], feel: ['felt', 'felt'],
    fight: ['fought', 'fought'], find: ['found', 'found'], flee: ['fled', 'fled'], fly: ['flew', 'flown'], forbid: ['forbade', 'forbidden'],
    forget: ['forgot', 'forgotten'], forgive: ['forgave', 'forgiven'], freeze: ['froze', 'frozen'], get: ['got', 'gotten'], give: ['gave', 'given'],
    go: ['went', 'gone'], grind: ['ground', 'ground'], grow: ['grew', 'grown'], hang: ['hung', 'hung'], have: ['had', 'had'],
    hear: ['heard', 'heard'], hide: ['hid', 'hidden'], hit: ['hit', 'hit'], hold: ['held', 'held'], hurt: ['hurt', 'hurt'],
    keep: ['kept', 'kept'], kneel: ['knelt', 'knelt'], know: ['knew', 'known'], lay: ['laid', 'laid'], lead: ['led', 'led'],
    lean: ['leaned', 'leaned'], leave: ['left', 'left'], lend: ['lent', 'lent'], let: ['let', 'let'], lie: ['lay', 'lain'],
    light: ['lit', 'lit'], lose: ['lost', 'lost'], make: ['made', 'made'], mean: ['meant', 'meant'], meet: ['met', 'met'],
    mistake: ['mistook', 'mistaken'], overcome: ['overcame', 'overcome'], pay: ['paid', 'paid'], put: ['put', 'put'], quit: ['quit', 'quit'],
    read: ['read', 'read'], ride: ['rode', 'ridden'], ring: ['rang', 'rung'], rise: ['rose', 'risen'], run: ['ran', 'run'],
    say: ['said', 'said'], see: ['saw', 'seen'], seek: ['sought', 'sought'], sell: ['sold', 'sold'], send: ['sent', 'sent'],
    set: ['set', 'set'], sew: ['sewed', 'sewn'], shake: ['shook', 'shaken'], shine: ['shone', 'shone'], shoot: ['shot', 'shot'],
    show: ['showed', 'shown'], shut: ['shut', 'shut'], sing: ['sang', 'sung'], sink: ['sank', 'sunk'], sit: ['sat', 'sat'],
    sleep: ['slept', 'slept'], slide: ['slid', 'slid'], speak: ['spoke', 'spoken'], spend: ['spent', 'spent'], spin: ['spun', 'spun'],
    split: ['split', 'split'], spread: ['spread', 'spread'], stand: ['stood', 'stood'], steal: ['stole', 'stolen'], stick: ['stuck', 'stuck'],
    sting: ['stung', 'stung'], strike: ['struck', 'struck'], swear: ['swore', 'sworn'], sweep: ['swept', 'swept'], swim: ['swam', 'swum'],
    swing: ['swung', 'swung'], take: ['took', 'taken'], teach: ['taught', 'taught'], tear: ['tore', 'torn'], tell: ['told', 'told'],
    think: ['thought', 'thought'], throw: ['threw', 'thrown'], understand: ['understood', 'understood'], wake: ['woke', 'woken'],
    wear: ['wore', 'worn'], weep: ['wept', 'wept'], win: ['won', 'won'], wind: ['wound', 'wound'], write: ['wrote', 'written'],
  };
  // 不規則な複数形
  const PLURAL = { child: 'children', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', mouse: 'mice', person: 'people', goose: 'geese',
    knife: 'knives', leaf: 'leaves', life: 'lives', wife: 'wives', half: 'halves', shelf: 'shelves', wolf: 'wolves', thief: 'thieves', loaf: 'loaves',
    potato: 'potatoes', tomato: 'tomatoes', hero: 'heroes', echo: 'echoes', quiz: 'quizzes', medium: 'media', bus: 'buses', ox: 'oxen', cactus: 'cacti', datum: 'data', phenomenon: 'phenomena', crisis: 'crises', analysis: 'analyses' };
  // 複数形にしない名詞（数えられない・もともと複数・単複同形）
  const NOPLURAL = new Set(['people', 'clothes', 'species', 'police', 'sheep', 'fish', 'deer', 'homework', 'housework', 'information', 'advice',
    'furniture', 'money', 'news', 'mathematics', 'physics', 'economics', 'luggage', 'baggage', 'equipment', 'knowledge', 'courage', 'wildlife',
    'pollution', 'traffic', 'garbage', 'trash', 'electricity', 'oxygen', 'wealth', 'health', 'happiness', 'education', 'agriculture', 'nature',
    'cash', 'flour', 'salt', 'honey', 'meat', 'wheat', 'sand', 'mud', 'dust', 'sweat', 'blood', 'steel', 'coal', 'silk', 'cotton', 'leather',
    'sunshine', 'sunlight', 'thunder', 'weather', 'music', 'humor', 'anger', 'fear', 'joy', 'panic', 'stress', 'harm', 'hunger', 'luck',
    'pleasure', 'pressure', 'respect', 'strength', 'reality', 'harmony', 'entertainment', 'amusement', 'logic', 'biology', 'architecture',
    'technology', 'science', 'culture', 'fashion', 'communication', 'countryside', 'midnight', 'childhood', 'youth', 'birth', 'poison', 'fiction',
    'plenty', 'truth', 'effort', 'population', 'fever', 'spirit', 'background', 'evidence', 'research', 'progress', 'water', 'air', 'rice', 'bread']);
  const VOWEL = /[aeiou]/;
  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // 最後の子音を重ねるか（stop → stopped）。1音節の「子音＋母音1つ＋子音」と、後ろを強く読む2音節の語
  const DOUBLE = new Set(['admit', 'commit', 'control', 'occur', 'prefer', 'refer', 'regret', 'permit', 'submit', 'transfer', 'omit', 'equip', 'forget', 'begin', 'upset', 'compel', 'expel', 'propel', 'patrol']);
  function doubles(w) {
    if (DOUBLE.has(w)) return true;
    if (/[wxy]$/.test(w)) return false;
    const m = w.match(/[aeiou]+/g);
    return !!m && m.length === 1 && /[^aeiou][aeiou][^aeiou]$/.test(w);
  }
  function sForm(w) { // 三単現の -s・名詞の複数形（規則）
    if (w === 'be') return 'is';
    if (w === 'have') return 'has';
    if (w === 'do' || w === 'go') return w + 'es';
    if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
    return w + 's';
  }
  function plural(w) { if (NOPLURAL.has(w)) return w; return PLURAL[w] || sForm(w); }
  function edForm(w) {
    if (/e$/.test(w)) return w + 'd';
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ied';
    if (/c$/.test(w)) return w + 'ked';
    if (doubles(w)) return w + w.slice(-1) + 'ed';
    return w + 'ed';
  }
  function ingForm(w) {
    if (w === 'be') return 'being';
    if (/ie$/.test(w)) return w.slice(0, -2) + 'ying';
    if (/[^e]e$/.test(w) && !/(ye|oe)$/.test(w)) return w.slice(0, -1) + 'ing';
    if (/c$/.test(w)) return w + 'king';
    if (doubles(w)) return w + w.slice(-1) + 'ing';
    return w + 'ing';
  }
  const past = (w) => (IRR[w] ? IRR[w][0] : edForm(w));
  const pp = (w) => (IRR[w] ? IRR[w][1] : edForm(w));

  // 品詞（だいたい）：'verb' | 'noun' | 'other'
  // 意味からの推定がはずれる語（必要に応じて足す）
  const POS_FIX = { couple: 'noun', trap: 'noun', bit: 'noun', responsible: 'other', familiar: 'other', altogether: 'other', portable: 'other',
    dead: 'other', nowadays: 'other', upstairs: 'other', downstairs: 'other', abroad: 'other', alive: 'other', alone: 'other', asleep: 'other', afraid: 'other' };
  function pos(word, meaning) {
    if (POS_FIX[String(word).toLowerCase()]) return POS_FIX[String(word).toLowerCase()];
    const m = String(meaning || '').split(/[，,、]/)[0].replace(/（[^）]*）|\([^)]*\)/g, '').trim();
    if (/^[～~]/.test(m)) return 'other';                                     // 「～の上に」など（前置詞）
    if (/[うくぐすずつづぬぶむゆる]$/.test(m) && !/(ゆる|ずつ)$/.test(m)) return 'verb'; // 「創造する」「乗る」「書く」
    if (/(い|な|の|た|だ|で|に|へ|て|も|ほど|ずつ)$/.test(m)) return 'other';  // 形容詞・副詞など
    return 'noun';
  }
  // 例文の空欄の語（form）が、単語（base）のどの形か
  function formOf(base, blank) {
    const w = base.toLowerCase(), b = String(blank || '').toLowerCase();
    if (!b || b === w) return 'base';
    if (IRR[w]) { if (b === IRR[w][0] && b !== IRR[w][1]) return 'past'; if (b === IRR[w][1] && b !== IRR[w][0]) return 'pp'; if (b === IRR[w][0]) return 'ed'; }
    if (b === PLURAL[w] || b === sForm(w)) return 's';
    if (b === edForm(w)) return 'ed';
    if (b === ingForm(w)) return 'ing';
    if (b === w + 's' || b === w + 'es') return 's';
    if (b === w + 'ed' || b === w + 'd') return 'ed';
    if (b === w + 'ing') return 'ing';
    return 'other';
  }
  // 単語を、指定の形にする（品詞に合わない形・分からない形は原形のまま）
  function apply(base, p, form) {
    const w = base.toLowerCase();
    if (/\s|-/.test(w)) return base;
    if (p === 'verb') {
      if (form === 's') return sForm(w);
      if (form === 'ed') return past(w); // 規則動詞（過去形と過去分詞が同じ）
      if (form === 'past') return past(w);
      if (form === 'pp') return pp(w);
      if (form === 'ing') return ingForm(w);
    }
    if (p === 'noun' && form === 's') return plural(w);
    return base;
  }
  // 例文の中で、その語が数えられる名詞として使われているか（複数形・a/an のあと）
  function countable(base, exs) {
    const w = base.toLowerCase();
    if (NOPLURAL.has(w)) return false;
    return (exs || []).some((e) => { const f = formOf(w, e.blank); return f === 's' || new RegExp(`\\b(a|an|one|another|each|every)\\s+(\\w+\\s+)?${w}\\b`, 'i').test(e.en || ''); });
  }
  // 穴うめの選択肢を作る
  // q：{ w：正解の単語, ex：{ blank } }、others：ほかの選択肢の単語、info(w)：{ meaning, ex }
  // 戻り値：[{ w：もとの単語, text：表示する形 }]
  function choices(q, others, info) {
    const qi = info(q.w), qp = pos(q.w, qi.meaning);
    const form = q.ex && !q.ex.noEx ? formOf(q.w, q.ex.blank) : 'base';
    const blank = q.ex && !q.ex.noEx ? String(q.ex.blank) : q.w;
    const cap = /^[A-Z]/.test(blank) && !/^[A-Z]/.test(q.w);
    const shape = (s) => (cap ? capFirst(s) : s);
    const list = [{ w: q.w, text: shape(blank.toLowerCase()) }]; // 正解は、例文の中の形そのまま
    others.forEach((o) => {
      const oi = info(o), op = pos(o, oi.meaning);
      let t = o;
      if (form !== 'base' && form !== 'other' && op === qp) {
        if (qp === 'noun' && form === 's' && !countable(o, oi.ex)) t = o; // 数えられない名詞は複数形にしない
        else t = apply(o, op, form);
      }
      list.push({ w: o, text: shape(t) });
    });
    return list;
  }
  // ほかの選択肢を選ぶ：同じ品詞（複数形なら数えられる名詞）を優先する
  function pickOthers(q, pool, info, n = 3, rnd = Math.random) {
    const qi = info(q.w), qp = pos(q.w, qi.meaning);
    const form = q.ex && !q.ex.noEx ? formOf(q.w, q.ex.blank) : 'base';
    const sh = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const cand = sh(pool.filter((x) => x !== q.w));
    const good = cand.filter((o) => { const oi = info(o); return pos(o, oi.meaning) === qp && !(qp === 'noun' && form === 's' && !countable(o, oi.ex)); });
    const out = good.slice(0, n);
    cand.forEach((o) => { if (out.length < n && !out.includes(o)) out.push(o); });
    return out;
  }
  return { pos, formOf, apply, choices, pickOthers, countable, plural, past, pp, ingForm, sForm };
})();
if (typeof window !== 'undefined') window.Inflect = Inflect;
