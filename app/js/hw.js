// 手書き文字の認識（iPadの中だけで行う。外部には送らない）
// しくみ：$P 法（Vatavu ほか 2012）。書いた線を32個の点に置きかえ、a〜z の手本の点と、形の近さを比べる。
// 線の順番や向きは気にしない（どの順で書いても同じ文字として扱う）。
// さらに、マスの4本線に対する高さ（上に出るか・下に出るか）も見る。
// 「書く練習」でお手本を見ながら書いた字を、その生徒専用の手本として覚え、字の癖に合わせていく。
const HW = (() => {
  const N = 32;
  // マスの4本線（マスの高さに対する位置）：上の線・x の高さ・基準線・下の線
  const GUIDE = { top: 0.10, x: 0.36, base: 0.62, bottom: 0.88 };
  const UNIT = (GUIDE.base - GUIDE.x); // 手本の1単位（x の高さ。マスの高さに対する割合）
  const ASPECT = 0.8; // マスの幅 ÷ 高さ（css の aspect-ratio: 4 / 5 と同じにする）

  // ---------- 手本（y：0=上の線、1=xの高さ、2=基準線、3=下の線） ----------
  function line(x1, y1, x2, y2, k = 8) { const p = []; for (let i = 0; i <= k; i++) p.push([x1 + (x2 - x1) * i / k, y1 + (y2 - y1) * i / k]); return p; }
  function arc(cx, cy, rx, ry, a0, a1, k = 24) { const p = []; for (let i = 0; i <= k; i++) { const a = (a0 + (a1 - a0) * i / k) * Math.PI / 180; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return p; }
  function poly(...pts) { const out = []; for (let i = 1; i < pts.length; i++) out.push(...line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]).slice(i > 1 ? 1 : 0)); return out; }
  const circle = (cx, cy, rx, ry) => arc(cx, cy, rx, ry, 0, 360, 32);
  const dot = (x, y) => line(x, y - 0.06, x, y + 0.06, 3);

  const BASE = {
    a: [[circle(0.45, 1.5, 0.38, 0.5), line(0.84, 1.0, 0.84, 2.0)],
        [arc(0.5, 1.25, 0.32, 0.28, 200, 360).concat(line(0.82, 1.25, 0.82, 2.0)), arc(0.5, 1.68, 0.32, 0.32, -10, -340)]],
    b: [[line(0.15, 0, 0.15, 2), circle(0.53, 1.5, 0.38, 0.5)]],
    c: [[arc(0.55, 1.5, 0.45, 0.5, -40, -320)]],
    d: [[circle(0.45, 1.5, 0.38, 0.5), line(0.84, 0, 0.84, 2)]],
    e: [[line(0.1, 1.5, 0.9, 1.5).concat(arc(0.5, 1.5, 0.4, 0.5, 0, -320))]],
    f: [[arc(0.68, 0.38, 0.27, 0.38, -20, -180).concat(line(0.41, 0.38, 0.41, 2)), line(0.12, 1, 0.8, 1)]],
    g: [[circle(0.45, 1.5, 0.38, 0.5), line(0.84, 1, 0.84, 2.6).concat(arc(0.5, 2.6, 0.34, 0.38, 0, 160))]],
    h: [[line(0.15, 0, 0.15, 2), arc(0.5, 1.5, 0.35, 0.5, 180, 360).concat(line(0.85, 1.5, 0.85, 2))]],
    i: [[line(0.5, 1, 0.5, 2), dot(0.5, 0.5)]],
    j: [[line(0.6, 1, 0.6, 2.6).concat(arc(0.35, 2.6, 0.25, 0.35, 0, 160)), dot(0.6, 0.5)]],
    k: [[line(0.15, 0, 0.15, 2), poly([0.8, 1], [0.17, 1.55], [0.85, 2])], [line(0.15, 0, 0.15, 2), line(0.8, 1, 0.2, 1.55), line(0.38, 1.42, 0.85, 2)]],
    l: [[line(0.5, 0, 0.5, 2)]],
    m: [[line(0.08, 1, 0.08, 2), arc(0.29, 1.45, 0.21, 0.45, 180, 360).concat(line(0.5, 1.45, 0.5, 2)), arc(0.71, 1.45, 0.21, 0.45, 180, 360).concat(line(0.92, 1.45, 0.92, 2))]],
    n: [[line(0.15, 1, 0.15, 2), arc(0.5, 1.45, 0.35, 0.45, 180, 360).concat(line(0.85, 1.45, 0.85, 2))]],
    o: [[circle(0.5, 1.5, 0.42, 0.5)]],
    p: [[line(0.15, 1, 0.15, 3), circle(0.52, 1.5, 0.37, 0.5)]],
    q: [[circle(0.45, 1.5, 0.38, 0.5), line(0.84, 1, 0.84, 3)]],
    r: [[line(0.2, 1, 0.2, 2), arc(0.52, 1.42, 0.32, 0.42, 180, 315)]],
    s: [[arc(0.5, 1.25, 0.34, 0.25, -20, -270).concat(arc(0.5, 1.75, 0.34, 0.25, -90, 160))]],
    t: [[line(0.45, 0.35, 0.45, 1.8).concat(arc(0.65, 1.8, 0.2, 0.2, 180, 60)), line(0.1, 1, 0.82, 1)]],
    u: [[line(0.15, 1, 0.15, 1.55).concat(arc(0.5, 1.55, 0.35, 0.45, 180, 0)), line(0.85, 1, 0.85, 2)]],
    v: [[poly([0.08, 1], [0.5, 2], [0.92, 1])]],
    w: [[poly([0.03, 1], [0.26, 2], [0.5, 1.15], [0.74, 2], [0.97, 1])]],
    x: [[line(0.1, 1, 0.9, 2), line(0.9, 1, 0.1, 2)]],
    y: [[line(0.1, 1, 0.52, 2), line(0.9, 1, 0.3, 3)],
        [line(0.15, 1, 0.15, 1.55).concat(arc(0.5, 1.55, 0.35, 0.45, 180, 0)), line(0.85, 1, 0.85, 2.6).concat(arc(0.5, 2.6, 0.35, 0.38, 0, 160))]],
    z: [[poly([0.1, 1], [0.9, 1], [0.1, 2], [0.9, 2])]],
  };

  // ---------- $P の計算 ----------
  function pathLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) if (pts[i].s === pts[i - 1].s) d += dist(pts[i - 1], pts[i]); return d; }
  function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function toPts(strokes) { const out = []; strokes.forEach((st, s) => st.forEach((p) => out.push({ x: p[0], y: p[1], s }))); return out; }
  function resample(pts, n) {
    if (pts.length === 0) return [];
    const I = pathLen(pts) / (n - 1);
    if (!(I > 0)) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y, s: 0 }));
    let D = 0; const out = [{ ...pts[0] }]; const p = pts.map((q) => ({ ...q }));
    for (let i = 1; i < p.length; i++) {
      if (p[i].s === p[i - 1].s) {
        const d = dist(p[i - 1], p[i]);
        if (D + d >= I) {
          const t = (I - D) / d;
          const q = { x: p[i - 1].x + t * (p[i].x - p[i - 1].x), y: p[i - 1].y + t * (p[i].y - p[i - 1].y), s: p[i].s };
          out.push(q); p.splice(i, 0, q); D = 0;
        } else D += d;
      }
    }
    while (out.length < n) out.push({ ...p[p.length - 1] });
    return out.slice(0, n);
  }
  function normalize(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const s = Math.max(maxX - minX, maxY - minY) || 1;
    const q = pts.map((p) => ({ x: (p.x - minX) / s, y: (p.y - minY) / s }));
    const cx = q.reduce((a, p) => a + p.x, 0) / q.length, cy = q.reduce((a, p) => a + p.y, 0) / q.length;
    return q.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  }
  function cloudDist(A, B, start) {
    const n = A.length, matched = new Array(n).fill(false);
    let sum = 0, i = start;
    do {
      let min = Infinity, idx = -1;
      for (let j = 0; j < n; j++) if (!matched[j]) { const d = dist(A[i], B[j]); if (d < min) { min = d; idx = j; } }
      matched[idx] = true;
      sum += (1 - ((i - start + n) % n) / n) * min;
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  function match(A, B) {
    const n = A.length, step = Math.floor(Math.sqrt(n));
    let min = Infinity;
    for (let i = 0; i < n; i += step) min = Math.min(min, cloudDist(A, B, i), cloudDist(B, A, i));
    return min;
  }
  // 高さ（手本の単位：0=上の線〜3=下の線）
  function heights(strokes) {
    let top = Infinity, bot = -Infinity;
    strokes.forEach((st) => st.forEach((p) => { top = Math.min(top, p[1]); bot = Math.max(bot, p[1]); }));
    return { top, bot };
  }

  // ---------- 手本の準備 ----------
  const templates = [];
  function addTemplate(ch, strokesUnits, personal) {
    const pts = toPts(strokesUnits);
    if (pts.length < 2) return;
    templates.push({ ch, cloud: normalize(resample(pts, N)), h: heights(strokesUnits), personal: !!personal });
  }
  Object.keys(BASE).forEach((ch) => BASE[ch].forEach((v) => {
    addTemplate(ch, v);
    // 少し傾けた形も手本にする（右上がり・左上がり）
    [-0.18, 0.18].forEach((k) => addTemplate(ch, v.map((st) => st.map(([x, y]) => [x + k * (2 - y) * 0.5, y]))));
  }));
  const EXPECT = {}; // 文字ごとの高さの目安
  Object.keys(BASE).forEach((ch) => { const h = heights(BASE[ch][0]); EXPECT[ch] = h; });

  // ---------- 生徒専用の手本（端末の中に保存） ----------
  const KEY = 'hw-personal-v1';
  const MAX_PER = 6;
  let personal = {};
  try { personal = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { personal = {}; }
  Object.keys(personal).forEach((ch) => personal[ch].forEach((s) => addTemplate(ch, s, true)));
  function learn(ch, strokesUnits) {
    if (!/^[a-z]$/.test(ch) || !strokesUnits.length) return;
    const list = personal[ch] = personal[ch] || [];
    const slim = strokesUnits.map((st) => st.filter((_, i) => i % 2 === 0 || i === st.length - 1).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
    list.push(slim);
    if (list.length > MAX_PER) list.shift();
    try { localStorage.setItem(KEY, JSON.stringify(personal)); } catch { /* 保存できなくても続ける */ }
    // 手本を作り直す
    for (let i = templates.length - 1; i >= 0; i--) if (templates[i].personal && templates[i].ch === ch) templates.splice(i, 1);
    list.forEach((s) => addTemplate(ch, s, true));
  }
  function personalCount() { return Object.keys(personal).reduce((a, k) => a + personal[k].length, 0); }
  function forget() { personal = {}; try { localStorage.removeItem(KEY); } catch { /* なし */ } for (let i = templates.length - 1; i >= 0; i--) if (templates[i].personal) templates.splice(i, 1); }

  // マスの中の座標（0〜1）を、手本の単位に直す
  function boxToUnits(strokesBox) {
    return strokesBox.map((st) => st.map(([x, y]) => [x * ASPECT / UNIT, (y - GUIDE.top) / UNIT]));
  }

  // 1マス分を認識する。戻り値：[{ ch, score }]（score が小さいほど近い）
  function recognize(strokesBox) {
    const units = boxToUnits(strokesBox.filter((s) => s.length));
    const pts = toPts(units);
    if (pts.length < 2) return [];
    const cloud = normalize(resample(pts, N));
    const h = heights(units);
    const best = {};
    templates.forEach((t) => {
      let d = match(cloud, t.cloud);
      if (t.personal) d *= 0.92; // 本人の字はやや優先
      if (best[t.ch] === undefined || d < best[t.ch]) best[t.ch] = d;
    });
    // 高さが合わない文字は遠ざける（上に出る文字・下に出る文字）
    const TOL = 0.45, W = 1.2;
    Object.keys(best).forEach((ch) => {
      const e = EXPECT[ch];
      const pen = Math.max(0, Math.abs(h.top - e.top) - TOL) + Math.max(0, Math.abs(h.bot - e.bot) - TOL);
      best[ch] += W * pen;
    });
    return Object.keys(best).map((ch) => ({ ch, score: best[ch] })).sort((a, b) => a.score - b.score);
  }

  // ---------- 手書きのマス（画面の部品） ----------
  // new HW.Boxes(el, { count, prefilled: 'c', onChange })
  class Boxes {
    constructor(el, opt = {}) {
      this.el = el; this.opt = opt; this.cells = [];
      el.innerHTML = ''; el.classList.add('hw-boxes');
      this.count = opt.count || 5;
      for (let i = 0; i < this.count; i++) this.cells.push(this._cell(i, i === 0 ? opt.prefilled : null));
      this._ro = window.ResizeObserver ? new ResizeObserver(() => this.cells.forEach((c) => c.fit())) : null;
      if (this._ro) this.cells.forEach((c) => this._ro.observe(c.cv));
      this._onResize = () => this.cells.forEach((c) => c.fit());
      window.addEventListener('resize', this._onResize);
    }
    destroy() { if (this._ro) this._ro.disconnect(); window.removeEventListener('resize', this._onResize); }
    _cell(i, fixed) {
      const wrap = document.createElement('div'); wrap.className = 'hw-cell' + (fixed ? ' fixed' : '');
      const cv = document.createElement('canvas'); wrap.appendChild(cv);
      this.el.appendChild(wrap);
      const g = cv.getContext('2d');
      const self = this;
      const c = { cv, strokes: [], fixed, W: 0, H: 0, live: {} };
      function guide() {
        g.save();
        [['top', '#c9d1d9'], ['x', '#e3b341'], ['base', '#e5534b'], ['bottom', '#c9d1d9']].forEach(([k, col]) => {
          g.strokeStyle = col; g.lineWidth = k === 'base' ? 1.5 : 1; g.setLineDash(k === 'x' ? [4, 4] : []);
          g.beginPath(); g.moveTo(0, GUIDE[k] * c.H); g.lineTo(c.W, GUIDE[k] * c.H); g.stroke();
        });
        g.restore();
      }
      function seg(a, b) { g.beginPath(); g.moveTo(a[0] * c.W, a[1] * c.H); g.lineTo(b[0] * c.W, b[1] * c.H); g.stroke(); }
      c.redraw = () => {
        g.clearRect(0, 0, c.W, c.H); guide();
        if (c.fixed) {
          g.fillStyle = '#57606a'; g.font = `${Math.round(c.H * 0.62)}px "Hiragino Sans", "Helvetica Neue", sans-serif`;
          g.textAlign = 'center'; g.textBaseline = 'alphabetic';
          g.fillText(c.fixed, c.W / 2, GUIDE.base * c.H);
          return;
        }
        g.lineWidth = Math.max(3, c.H * 0.035); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1f2328';
        c.strokes.forEach((st) => { if (st.length === 1) seg(st[0], st[0]); for (let k = 1; k < st.length; k++) seg(st[k - 1], st[k]); });
      };
      c.fit = () => {
        const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        if (!r.width || !r.height) return r;
        const bw = Math.round(r.width * dpr), bh = Math.round(r.height * dpr);
        if (cv.width !== bw || cv.height !== bh || c.W !== r.width || c.H !== r.height) {
          cv.width = bw; cv.height = bh; c.W = r.width; c.H = r.height;
          g.setTransform(dpr, 0, 0, dpr, 0, 0); c.redraw();
        }
        return r;
      };
      // マスの縦横比：高さ＝幅×1.25
      const pos = (e, r) => [Math.min(1.1, Math.max(-0.1, (e.clientX - r.left) / r.width)), Math.min(1.1, Math.max(-0.1, (e.clientY - r.top) / r.height))];
      if (!fixed) {
        cv.addEventListener('pointerdown', (e) => {
          if (self.opt.disabled) return;
          if (e.pointerType === 'pen') Boxes.lastPen = Date.now();
          if (e.pointerType === 'touch' && Date.now() - (Boxes.lastPen || 0) < 3000) return; // ペンの人の手のひら
          try { cv.setPointerCapture(e.pointerId); } catch { /* なし */ }
          const r = c.fit(), p = pos(e, r), st = [p];
          c.strokes.push(st); c.live[e.pointerId] = st; seg(p, p);
          e.preventDefault();
          if (self.opt.onStroke) self.opt.onStroke(i);
        });
        cv.addEventListener('pointermove', (e) => {
          const st = c.live[e.pointerId]; if (!st) return;
          if (e.pointerType === 'pen') Boxes.lastPen = Date.now();
          const r = c.fit(), evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
          (evs.length ? evs : [e]).forEach((ev) => { const p = pos(ev, r); seg(st[st.length - 1], p); st.push(p); });
          e.preventDefault();
        });
        const up = (e) => { if (c.live[e.pointerId]) { delete c.live[e.pointerId]; if (self.opt.onChange) self.opt.onChange(); } };
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      }
      c.fit();
      requestAnimationFrame(() => c.fit());
      return c;
    }
    clear() { this.cells.forEach((c) => { c.strokes = []; c.redraw(); }); if (this.opt.onChange) this.opt.onChange(); }
    undo() {
      for (let i = this.cells.length - 1; i >= 0; i--) { const c = this.cells[i]; if (c.strokes.length) { c.strokes.pop(); c.redraw(); break; } }
      if (this.opt.onChange) this.opt.onChange();
    }
    hasInk() { return this.cells.some((c) => c.strokes.length); }
    // 書いた文字を読む。戻り値：{ text, letters:[{ ch, cands, strokes }] }（空のマスは飛ばす）
    read() {
      const letters = [];
      this.cells.forEach((c) => {
        if (c.fixed) { letters.push({ ch: c.fixed, fixed: true, cands: [] }); return; }
        if (!c.strokes.length) return;
        const cands = recognize(c.strokes);
        letters.push({ ch: cands.length ? cands[0].ch : '?', cands: cands.slice(0, 4), strokes: c.strokes });
      });
      return { text: letters.map((l) => l.ch).join(''), letters };
    }
    // お手本を見て書いた字を、生徒専用の手本として覚える（正解の文字が候補の上位にあるときだけ）
    learnFrom(word) {
      const r = this.read();
      const ls = r.letters.filter((l) => !l.fixed);
      if (ls.length !== word.length) return 0;
      let n = 0;
      ls.forEach((l, k) => {
        const exp = word[k];
        if (l.cands.slice(0, 3).some((c) => c.ch === exp)) { learn(exp, boxToUnits(l.strokes)); n++; }
      });
      return n;
    }
  }

  return { recognize, learn, forget, personalCount, Boxes, GUIDE, UNIT, ASPECT, boxToUnits, _BASE: BASE, _templates: templates };
})();
