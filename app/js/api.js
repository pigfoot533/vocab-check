// Google（GAS）とのやりとり
// ・通行証（ログインの証明）の保管
// ・学習の記録は「送る箱」に入れて、まとめて裏で送る（失敗したら、あとで送り直す）
const API = (() => {
  const CFG = window.APP_CONFIG || {};
  const TKEY = 'app-token', QKEY = 'app-queue';
  let token = null;
  try { token = localStorage.getItem(TKEY); } catch { /* なし */ }

  // ログイン画面から戻ってきたとき、アドレス欄の通行証を受け取って消す
  const m = location.hash.match(/token=([^&]+)/);
  if (m) {
    token = decodeURIComponent(m[1]);
    try { localStorage.setItem(TKEY, token); } catch { /* なし */ }
    history.replaceState(null, '', location.pathname + location.search);
  }

  function loggedIn() { return !!token; }
  function login() { location.href = CFG.GAS_LOGIN_URL + '?return=' + encodeURIComponent(location.origin + location.pathname); }
  function logout() { token = null; try { localStorage.removeItem(TKEY); } catch { /* なし */ } }

  async function call(action, data, { tries = 3 } = {}) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(CFG.GAS_API_URL, { method: 'POST', body: JSON.stringify({ token, action, data: data || null }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (!j.ok && j.code === 'auth') { logout(); }
        return j;
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, 800 * (i + 1)));
      }
    }
    throw new Error('通信できませんでした（' + (lastErr && lastErr.message) + '）。電波のよい場所で、もう一度ためしてください。');
  }

  // ---- 記録を送る箱 ----
  let queue = [];
  try { queue = JSON.parse(localStorage.getItem(QKEY) || '[]') || []; } catch { queue = []; }
  const saveQ = () => { try { localStorage.setItem(QKEY, JSON.stringify(queue)); } catch { /* なし */ } };
  function record(ev) { ev.at = Date.now(); queue.push(ev); saveQ(); }
  let flushing = null;
  function flush() {
    if (flushing || !queue.length || !token) return flushing || Promise.resolve();
    const batch = queue.slice(0, 200);
    flushing = call('events', { events: batch }, { tries: 2 }).then((j) => {
      if (j.ok) { queue = queue.slice(batch.length); saveQ(); if (window.App) App.onProgress(j.progress); }
    }).catch(() => { /* あとで送り直す */ }).finally(() => { flushing = null; });
    return flushing;
  }
  setInterval(flush, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  function pending() { return queue.length; }

  return { loggedIn, login, logout, call, record, flush, pending };
})();
