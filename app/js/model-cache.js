// AIモデルなどの大きなデータを、初回だけインターネットから読み込み、端末の保存領域（Cache Storage）に保存する（ワーカー用）
// 2回目からは保存したものを使うので、インターネットなしで動く
const ModelCache = (() => {
  async function has(url, cacheName) {
    try { const c = await caches.open(cacheName); return !!(await c.match(url)); } catch { return false; }
  }
  // progress({ phase: 'open' | 'download' | 'nocache', got, total })
  async function get(url, cacheName, expectSize, progress, label = 'データ') {
    let c = null;
    try { c = await caches.open(cacheName); const hit = await c.match(url); if (hit) { progress({ phase: 'open' }); return new Uint8Array(await hit.arrayBuffer()); } } catch { c = null; }
    let r;
    try { r = await fetch(url); } catch { throw new Error(`${label}を読み込めませんでした。インターネットにつながっているか確認してください（初回だけ必要です）。`); }
    if (!r.ok) throw new Error(`${label}を読み込めませんでした（${r.status}）。`);
    const total = Number(r.headers.get('content-length')) || expectSize || 0;
    let data;
    if (r.body && r.body.getReader) {
      const reader = r.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        progress({ phase: 'download', got, total: Math.max(total, got) });
      }
      data = new Uint8Array(got); let o = 0;
      for (const ch of chunks) { data.set(ch, o); o += ch.length; }
    } else data = new Uint8Array(await r.arrayBuffer());
    if (c) { try { await c.put(url, new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch { progress({ phase: 'nocache' }); } }
    return data;
  }
  async function remove(cacheName) { try { await caches.delete(cacheName); } catch { /* なし */ } }
  return { has, get, remove };
})();
