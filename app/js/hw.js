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

  // 書き方の違う形（人によって書き方が違う文字）
  const EXTRA = {
    a: [[circle(0.45, 1.5, 0.38, 0.5).concat(line(0.84, 1.5, 0.84, 2.0))]],                    // ひと筆で書く a
    b: [[line(0.15, 0, 0.15, 2).concat(arc(0.5, 1.55, 0.35, 0.45, 180, -180))]],                 // ひと筆で書く b
    d: [[circle(0.45, 1.5, 0.38, 0.5).concat(line(0.84, 1.5, 0.84, 0), line(0.84, 0, 0.84, 2))]],
    e: [[line(0.12, 1.45, 0.88, 1.45).concat(arc(0.5, 1.5, 0.38, 0.48, 0, -300))]],
    f: [[line(0.45, 0.05, 0.45, 2), line(0.15, 1, 0.8, 1)], [arc(0.62, 0.3, 0.2, 0.3, -10, -180).concat(line(0.42, 0.3, 0.42, 2)), line(0.15, 1, 0.75, 1)]],
    g: [[circle(0.45, 1.5, 0.38, 0.5), line(0.84, 1, 0.84, 3)], [circle(0.45, 1.5, 0.38, 0.5), line(0.84, 1, 0.84, 2.6).concat(arc(0.55, 2.6, 0.29, 0.38, 0, 180))]],
    h: [[line(0.15, 0, 0.15, 2).concat(line(0.15, 2, 0.15, 1.5), arc(0.5, 1.5, 0.35, 0.5, 180, 360), line(0.85, 1.5, 0.85, 2))]],
    i: [[line(0.5, 1, 0.5, 2)]],                                                                  // 点を書かない i
    j: [[line(0.6, 1, 0.6, 2.6).concat(arc(0.35, 2.6, 0.25, 0.35, 0, 160))]],                    // 点を書かない j
    k: [[line(0.15, 0, 0.15, 2), poly([0.85, 0.9], [0.17, 1.5], [0.85, 2])]],
    l: [[line(0.45, 0, 0.45, 1.75).concat(arc(0.65, 1.75, 0.2, 0.25, 180, 60))]],                // 下をはねる l
    m: [[line(0.08, 1, 0.08, 2).concat(line(0.08, 2, 0.08, 1.45), arc(0.29, 1.45, 0.21, 0.45, 180, 360), line(0.5, 1.45, 0.5, 2), line(0.5, 2, 0.5, 1.45), arc(0.71, 1.45, 0.21, 0.45, 180, 360), line(0.92, 1.45, 0.92, 2))]],
    n: [[line(0.15, 1, 0.15, 2).concat(line(0.15, 2, 0.15, 1.45), arc(0.5, 1.45, 0.35, 0.45, 180, 360), line(0.85, 1.45, 0.85, 2))]],
    p: [[line(0.15, 1, 0.15, 3).concat(line(0.15, 3, 0.15, 1.2), arc(0.5, 1.5, 0.35, 0.45, -150, 160))]],
    q: [[circle(0.45, 1.5, 0.38, 0.5), line(0.84, 1, 0.84, 3).concat(line(0.84, 3, 1.0, 2.8))]],
    r: [[line(0.2, 1, 0.2, 2).concat(line(0.2, 2, 0.2, 1.35), arc(0.5, 1.35, 0.3, 0.3, 180, 300))]],
    t: [[line(0.45, 0.3, 0.45, 2), line(0.12, 1, 0.8, 1)]],                                       // はねない t
    u: [[line(0.15, 1, 0.15, 1.55).concat(arc(0.5, 1.55, 0.35, 0.45, 180, 0), line(0.85, 1.55, 0.85, 1), line(0.85, 1, 0.85, 2))], [line(0.15, 1, 0.15, 1.55).concat(arc(0.5, 1.55, 0.35, 0.45, 180, 0), line(0.85, 1.55, 0.85, 1))]],
    y: [[poly([0.1, 1], [0.5, 2]), poly([0.9, 1], [0.5, 2], [0.3, 3])]],
    // r・n・h は形が近いので、生徒がよく書く形を多めに入れる（2026年11月：「判定が厳しい」との報告）
    rr: [], // （下でまとめて追加）
  };
  delete EXTRA.rr;
  EXTRA.r = (EXTRA.r || []).concat([
    [line(0.2, 1, 0.2, 2), arc(0.55, 1.4, 0.35, 0.4, 180, 330)],                                     // 腕が長い r
    [line(0.25, 1, 0.25, 2), arc(0.6, 1.5, 0.35, 0.5, 190, 300)],                                     // 腕が下がる r
    [line(0.2, 1, 0.2, 2).concat(line(0.2, 2, 0.2, 1.3), arc(0.5, 1.35, 0.3, 0.35, 180, 345))],      // ひと筆の r
  ]);
  EXTRA.n = (EXTRA.n || []).concat([
    [line(0.15, 0.85, 0.15, 2), arc(0.5, 1.45, 0.35, 0.45, 180, 360).concat(line(0.85, 1.45, 0.85, 2))], // 最初の縦線が少し上に出る n
    [line(0.15, 1, 0.15, 2), arc(0.5, 1.5, 0.35, 0.4, 190, 360).concat(line(0.85, 1.5, 0.85, 2))],       // 山が低い n
    [line(0.15, 1, 0.15, 2), arc(0.52, 1.35, 0.37, 0.35, 180, 360).concat(line(0.89, 1.35, 0.89, 2))],  // 山が丸い n
  ]);
  EXTRA.h = (EXTRA.h || []).concat([
    [line(0.15, 0.55, 0.15, 2), arc(0.5, 1.5, 0.35, 0.5, 180, 360).concat(line(0.85, 1.5, 0.85, 2))],  // 上の縦線が短い h
    [line(0.15, 0.3, 0.15, 2).concat(line(0.15, 2, 0.15, 1.5), arc(0.5, 1.5, 0.35, 0.45, 180, 360), line(0.85, 1.5, 0.85, 2))],
  ]);
  // 大文字（すべて正解として認める。高さは 0＝上の線 〜 2＝基準線）
  const UPPER = {
    a: [[poly([0.1, 2], [0.5, 0], [0.9, 2]), line(0.27, 1.25, 0.73, 1.25)]],
    b: [[line(0.15, 0, 0.15, 2), arc(0.15, 0.5, 0.6, 0.5, -90, 90), arc(0.15, 1.5, 0.7, 0.5, -90, 90)]],
    c: [[arc(0.55, 1, 0.45, 1, -40, -320)]],
    d: [[line(0.15, 0, 0.15, 2), arc(0.15, 1, 0.75, 1, -90, 90)]],
    e: [[poly([0.85, 0], [0.15, 0], [0.15, 2], [0.85, 2]), line(0.15, 1, 0.7, 1)]],
    f: [[poly([0.85, 0], [0.15, 0], [0.15, 2]), line(0.15, 1, 0.7, 1)]],
    g: [[arc(0.55, 1, 0.45, 1, -40, -360).concat(line(1.0, 1, 0.6, 1))]],
    h: [[line(0.15, 0, 0.15, 2), line(0.85, 0, 0.85, 2), line(0.15, 1, 0.85, 1)]],
    i: [[line(0.5, 0, 0.5, 2)], [line(0.5, 0, 0.5, 2), line(0.25, 0, 0.75, 0), line(0.25, 2, 0.75, 2)]],
    j: [[line(0.65, 0, 0.65, 1.6).concat(arc(0.4, 1.6, 0.25, 0.4, 0, 180))]],
    k: [[line(0.15, 0, 0.15, 2), poly([0.85, 0], [0.17, 1.05], [0.85, 2])]],
    l: [[poly([0.2, 0], [0.2, 2], [0.85, 2])]],
    m: [[poly([0.05, 2], [0.05, 0], [0.5, 1.3], [0.95, 0], [0.95, 2])]],
    n: [[poly([0.1, 2], [0.1, 0], [0.9, 2], [0.9, 0])]],
    o: [[circle(0.5, 1, 0.42, 1)]],
    p: [[line(0.15, 0, 0.15, 2), arc(0.15, 0.55, 0.65, 0.55, -90, 90)]],
    q: [[circle(0.5, 1, 0.42, 1), line(0.6, 1.5, 0.95, 2.1)]],
    r: [[line(0.15, 0, 0.15, 2), arc(0.15, 0.55, 0.6, 0.55, -90, 90).concat(line(0.15, 1.1, 0.85, 2))]],
    s: [[arc(0.5, 0.5, 0.4, 0.5, -20, -270).concat(arc(0.5, 1.5, 0.4, 0.5, -90, 160))]],
    t: [[line(0.1, 0, 0.9, 0), line(0.5, 0, 0.5, 2)]],
    u: [[line(0.15, 0, 0.15, 1.4).concat(arc(0.5, 1.4, 0.35, 0.6, 180, 0), line(0.85, 1.4, 0.85, 0))]],
    v: [[poly([0.05, 0], [0.5, 2], [0.95, 0])]],
    w: [[poly([0.02, 0], [0.25, 2], [0.5, 0.4], [0.75, 2], [0.98, 0])]],
    x: [[line(0.1, 0, 0.9, 2), line(0.9, 0, 0.1, 2)]],
    y: [[poly([0.1, 0], [0.5, 1]), poly([0.9, 0], [0.5, 1], [0.5, 2])]],
    z: [[poly([0.1, 0], [0.9, 0], [0.1, 2], [0.9, 2])]],
  };

  // ===== 判定の基準（実際の生徒の字で調整するときは、ここだけ直す） =====
  // 「正解の字に見えるか」を確かめる方式：正解の文字が近い順で rankMax 位以内、かつ点が「1位の点 × ratio ＋ margin」以内なら○
  const RULE = { rankMax: 3, ratio: 1.3, margin: 0.15, heightWeight: 0, minStroke: 0.035, personalBonus: 0.9,
    // 形がもともと近い組：1位がこの組の文字なら、もっと甘く見る
    near: [['r', 'n'], ['n', 'h'], ['n', 'm']], nearRank: 4, nearRatio: 1.7, nearMargin: 0.35,
    // n と h の区別：左の縦線が右の山より上に突き出している割合（字の高さに対して）
    hMin: 0.2,   // h だと認めるには、これ以上突き出していること（試験：n→h 約1%、h を○ 約100%）
    nMax: 0.3 };  // n だと認めるには、これ以下であること（はっきり突き出していたら n にしない）
  // 左の縦線が、右の部分よりどれだけ上に出ているか（0〜1）。n はほぼ0、h は大きい
  function stemRise(strokes) {
    const pts = strokes.flat();
    if (pts.length < 4) return 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, top = null;
    pts.forEach((p) => { const [x, y] = p; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); if (y < y0) { y0 = y; top = p; } });
    const w = x1 - x0 || 1e-6, h = y1 - y0 || 1e-6;
    // いちばん上の点から横に離れた部分（傾けて書いても、h の山や右の縦線はここに入る）の、いちばん上
    let restTop = Infinity;
    pts.forEach(([x, y]) => { if (Math.abs(x - top[0]) > 0.35 * w) restTop = Math.min(restTop, y); });
    if (!isFinite(restTop)) return 0;
    return Math.max(0, (restTop - y0) / h);
  }

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
  // 速く計算するため、点は x・y の数の並び（Float64Array）で持つ。途中で「もう負け」と分かったら打ち切る
  const MATCHED = new Uint8Array(64);
  function cloudDist(A, B, start, best) {
    const n = A.x.length; MATCHED.fill(0, 0, n);
    let sum = 0, i = start;
    do {
      let min = Infinity, idx = -1;
      const ax = A.x[i], ay = A.y[i];
      for (let j = 0; j < n; j++) if (!MATCHED[j]) { const dx = ax - B.x[j], dy = ay - B.y[j], d = dx * dx + dy * dy; if (d < min) { min = d; idx = j; } }
      MATCHED[idx] = 1;
      sum += (1 - ((i - start + n) % n) / n) * Math.sqrt(min);
      if (sum >= best) return sum;
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  function match(A, B, best = Infinity) {
    const n = A.x.length, step = Math.floor(Math.sqrt(n));
    let min = best;
    for (let i = 0; i < n; i += step) { min = Math.min(min, cloudDist(A, B, i, min)); min = Math.min(min, cloudDist(B, A, i, min)); }
    return min;
  }
  const toXY = (pts) => ({ x: Float64Array.from(pts, (p) => p.x), y: Float64Array.from(pts, (p) => p.y) });
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
    templates.push({ ch, cloud: toXY(normalize(resample(pts, N))), rough: toXY(normalize(resample(pts, 10))), h: heights(strokesUnits), personal: !!personal });
  }
  [BASE, EXTRA, UPPER].forEach((set) => Object.keys(set).forEach((ch) => set[ch].forEach((v) => {
    addTemplate(ch, v);
    // 少し傾けた形も手本にする（右上がり・左上がり）
    [-0.18, 0.18].forEach((k) => addTemplate(ch, v.map((st) => st.map(([x, y]) => [x + k * (2 - y) * 0.5, y]))));
  })));
  const EXPECT = {}; // 文字ごとの高さの目安
  Object.keys(BASE).forEach((ch) => { const h = heights(BASE[ch][0]); EXPECT[ch] = h; });

  // ---------- 生徒専用の手本（端末の中に保存） ----------
  const KEY = 'hw-personal-v1';
  const MAX_PER = 10;
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
  // とても短い線（書き損じの点・ペン先が触れた跡）を除く。ただし、ほかの線より上にある点（i・j の点）は残す
  function cleanStrokes(strokesBox) {
    const len = (st) => { let d = 0; for (let i = 1; i < st.length; i++) d += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]); return d; };
    const sts = strokesBox.filter((s) => s.length);
    const big = sts.filter((st) => len(st) >= RULE.minStroke);
    if (!big.length) return sts;
    const top = Math.min(...big.map((st) => Math.min(...st.map((p) => p[1]))));
    return sts.filter((st) => len(st) >= RULE.minStroke || Math.max(...st.map((p) => p[1])) < top + 0.02);
  }
  function recognize(strokesBox) {
    const units = boxToUnits(cleanStrokes(strokesBox));
    const pts = toPts(units);
    if (pts.length < 2) return [];
    const cloud = toXY(normalize(resample(pts, N))), rough = toXY(normalize(resample(pts, 10)));
    const h = heights(units);
    // ① 大まかな形（10点）で全部の手本と比べ、近いものだけを残す（文字ごとに最低1つは残す）
    const pre = templates.map((t) => ({ t, d: match(rough, t.rough) * (t.personal ? RULE.personalBonus : 1) })).sort((a, b) => a.d - b.d);
    const keep = new Set(pre.slice(0, 48).map((x) => x.t));
    const seen = {}; pre.forEach((x) => { if (!seen[x.t.ch]) { seen[x.t.ch] = 1; keep.add(x.t); } });
    // ② 残った手本と、くわしい形（32点）で比べる
    const best = {};
    pre.forEach(({ t }) => {
      if (!keep.has(t)) return;
      const lim = best[t.ch] === undefined ? Infinity : best[t.ch] / (t.personal ? RULE.personalBonus : 1);
      let d = match(cloud, t.cloud, lim);
      if (t.personal) d *= RULE.personalBonus; // 本人の字はやや優先
      if (best[t.ch] === undefined || d < best[t.ch]) best[t.ch] = d;
    });
    // 高さが合わない文字は遠ざける（上に出る文字・下に出る文字）
    const TOL = 0.45, W = RULE.heightWeight; // 高さ（4本線）は、いまは見ない（重み0）
    if (W) Object.keys(best).forEach((ch) => {
      const e = EXPECT[ch];
      const pen = Math.max(0, Math.abs(h.top - e.top) - TOL) + Math.max(0, Math.abs(h.bot - e.bot) - TOL);
      best[ch] += W * pen;
    });
    return Object.keys(best).map((ch) => ({ ch, score: best[ch] })).sort((a, b) => a.score - b.score);
  }

  // 正解の文字 exp に見えるか（cands：近い順の一覧）
  function looksLike(cands, exp) {
    if (!cands || !cands.length) return false;
    const k = cands.findIndex((c) => c.ch === exp);
    if (k < 0) return false;
    if (k === 0) return true;
    if (k < RULE.rankMax && cands[k].score <= cands[0].score * RULE.ratio + RULE.margin) return true;
    const near = RULE.near.some((g) => g.includes(exp) && g.includes(cands[0].ch));
    return near && k < RULE.nearRank && cands[k].score <= cands[0].score * RULE.nearRatio + RULE.nearMargin;
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
      const pos = (e, r) => [Math.min(1.6, Math.max(-0.6, (e.clientX - r.left) / r.width)), Math.min(1.6, Math.max(-0.6, (e.clientY - r.top) / r.height))]; // マスからはみ出しても使う
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
        letters.push({ ch: cands.length ? cands[0].ch : '?', cands, strokes: c.strokes });
      });
      return { text: letters.map((l) => l.ch).join(''), letters };
    }
    // 単語として正解か（1文字ずつ「正解の字に見えるか」を確かめる）。戻り値：{ ok, text, letters:[{ exp, ch, ok, cands, strokes }] }
    check(word) {
      const r = this.read();
      const ls = r.letters;
      const out = ls.map((l, k) => {
        const exp = word[k];
        let ok = l.fixed ? l.ch === exp : looksLike(l.cands, exp);
        // n と h は、左の縦線の突き出し具合でも確かめる（n を h と取りちがえないように）
        if (ok && !l.fixed && (exp === 'h' || exp === 'n')) {
          const rise = stemRise(cleanStrokes(l.strokes));
          if (exp === 'h' && rise < RULE.hMin) ok = false;
          if (exp === 'n' && rise > RULE.nMax) ok = false;
        }
        return { ...l, exp, ok };
      });
      const ok = ls.length === word.length && out.every((l) => l.ok);
      // 正解の文字に見えた字は、その文字として表示する（読み取り結果の表示用）
      const text = out.map((l) => (l.ok ? l.exp : l.ch)).join('');
      return { ok, text, letters: out };
    }
    // 正解と分かっている字を、生徒専用の手本として覚える（正解の文字が候補の5位以内にあるときだけ）
    learnFrom(word) {
      const r = this.read();
      const ls = r.letters.filter((l) => !l.fixed);
      const exps = word.slice(r.letters.length - ls.length);
      if (ls.length !== exps.length) return 0;
      let n = 0;
      ls.forEach((l, k) => {
        const exp = exps[k];
        if (l.cands.slice(0, 5).some((c) => c.ch === exp)) { learn(exp, boxToUnits(cleanStrokes(l.strokes))); n++; }
      });
      return n;
    }
    // 読み違えた字の線の形（手本の調整用の記録）。座標は 0〜1 で、点は間引く
    misses(word) {
      const c = this.check(word);
      return c.letters.filter((l) => !l.ok && !l.fixed && l.strokes).map((l) => ({
        exp: l.exp, got: l.ch, top: (l.cands || []).slice(0, 3).map((x) => x.ch + Math.round(x.score * 100) / 100).join(' '),
        s: l.strokes.map((st) => st.filter((_, i) => i % 3 === 0 || i === st.length - 1).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])),
      }));
    }
  }

  return { recognize, looksLike, stemRise, cleanStrokes, learn, forget, personalCount, Boxes, GUIDE, UNIT, ASPECT, RULE, boxToUnits, _BASE: BASE, _EXTRA: EXTRA, _UPPER: UPPER, _templates: templates };
})();
