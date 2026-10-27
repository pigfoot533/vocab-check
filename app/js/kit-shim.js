// 発音判定キット用の小さな補助（元のアプリの util.js の一部だけを取り出したもの）
// 移植先のアプリにすでに同じ名前（U・Dbg）があれば、このファイルは読み込まずに、そちらへ合わせてください。
window.U = window.U || (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLACEHOLDER = /^(~|~ing|…|\.\.\.|[A-C]|sb|sth|sb's|sth's|someone|somebody|something|someone's|somebody's)$/;
  function phraseVariants(s) {
    const base = String(s ?? '').normalize('NFKC').replace(/[’‘`]/g, "'").replace(/[～〜]/g, '~');
    const alts = /\s\/\s/.test(base) ? base.split(/\s+\/\s+/) : [base];
    const out = [];
    for (const a of alts) {
      const m = /(\S+)\s*\[([^\]]+)\]/.exec(a);
      if (m) { out.push(a.replace(m[0], m[1])); out.push(a.replace(m[0], m[2])); } else out.push(a.replace(/[[\]]/g, ' '));
    }
    return out;
  }
  // 短いお知らせ（移植先のアプリの通知のしくみに置きかえてよい）
  function toast(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#333;color:#fff;padding:8px 14px;border-radius:8px;z-index:9999;font-size:14px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }
  return { esc, PLACEHOLDER, phraseVariants, toast };
})();

// 「Geminiにアドバイスをもらう」ボタン（PronJudge.adviceHtml）が使うリンク先
window.GeminiLink = window.GeminiLink || { URL: 'https://gemini.google.com/app' };
