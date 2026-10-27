// 録音の共通部品（iPad・iPhone でも止まらないように）と、確認用の表示
// ・「1回押して開始、もう1回押して停止」
// ・端末が対応している形式（mp4 / webm）を調べて使う
// ・マイクの許可と AudioContext の再開は、必ずボタン操作の中で行う
// ・音量の表示で、マイクに声が入っているか分かるようにする
// ・後の段階（ブラウザ内の発音判定）のために 16kHz・モノラルの音にも変換できる

// ---- 確認用の表示（設定でオン・オフ。不要になったらこのブロックごと消せる） ----
const Dbg = (() => {
  const KEY = 'tn-debug';
  const logs = [];
  const t0 = Date.now();
  let panel = null;
  const on = () => { try { return localStorage.getItem(KEY) === '1' || /[?&]debug\b/.test(location.search); } catch { return false; } };
  function set(v) { try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* noop */ } render(); }
  function log(msg) {
    const line = `${((Date.now() - t0) / 1000).toFixed(2)}s ${msg}`;
    logs.push(line);
    if (logs.length > 80) logs.shift();
    if (on()) render();
  }
  function render() {
    if (!on()) { if (panel) { panel.remove(); panel = null; } return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'dbg-panel';
      panel.innerHTML = '<div class="row between"><strong>確認用の表示</strong><span><button type="button" class="btn small" data-dbg="copy">記録をコピー</button> <button type="button" class="btn small" data-dbg="clear">消す</button> <button type="button" class="btn small" data-dbg="min">小さく</button></span></div><pre></pre>';
      panel.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-dbg]'); if (!b) return;
        if (b.dataset.dbg === 'copy') { const txt = `${env()}\n${logs.join('\n')}`; try { await navigator.clipboard.writeText(txt); U.toast('確認用の記録をコピーしました'); } catch { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); U.toast('確認用の記録をコピーしました'); } }
        if (b.dataset.dbg === 'clear') { logs.length = 0; render(); }
        if (b.dataset.dbg === 'min') panel.classList.toggle('min');
      });
      document.body.appendChild(panel);
    }
    panel.querySelector('pre').textContent = `${env()}\n${logs.slice(-25).join('\n')}`;
  }
  function env() {
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac', 'audio/ogg;codecs=opus'];
    const mr = window.MediaRecorder ? types.filter((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }).join(', ') || '(なし)' : 'MediaRecorderなし';
    return `端末: ${navigator.userAgent.slice(0, 120)}\n録音形式: ${mr} / 音声認識: ${window.SpeechRecognition ? 'あり' : window.webkitSpeechRecognition ? 'あり(webkit)' : 'なし'} / https: ${isSecureContext}`;
  }
  document.addEventListener('DOMContentLoaded', render);
  return { on, set, log, render };
})();

const Rec = (() => {
  let ctx = null;
  const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac'];
  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  function pickMime() {
    for (const t of TYPES) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* noop */ } }
    return '';
  }
  // ボタン操作の中で呼ぶ（iOS は操作の外だと音を扱えない）
  function audioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().then(() => Dbg.log(`AudioContext 再開: ${ctx.state}`)).catch((e) => Dbg.log(`AudioContext 再開エラー: ${e.message}`));
    return ctx;
  }

  // 録音開始。戻り値の stop() で録音を止めて { blob, mime, ms } を受け取る
  async function start({ onLevel, maxMs = 10000, onAutoStop } = {}) {
    if (!supported()) throw new Error('このブラウザでは録音できません。');
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch { /* noop */ } // 読み上げ中だと iOS で録音が止まることがある
    const ac = audioCtx();
    Dbg.log('マイクの許可を求めます');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      Dbg.log(`マイクのエラー: ${e.name} ${e.message}`);
      const err = new Error(e.name === 'NotAllowedError' ? 'マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。' : 'マイクが使えませんでした。マイクの接続を確認してください。');
      err.code = e.name; throw err;
    }
    const mime = pickMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    Dbg.log(`録音開始 形式=${recorder.mimeType || '(既定)'} AudioContext=${ac ? ac.state : 'なし'}`);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onerror = (e) => Dbg.log(`録音エラー: ${(e.error && e.error.name) || e.type}`);
    // 音量の表示（マイクに声が入っているかの目安）
    let raf = 0, src = null, an = null;
    if (ac && onLevel) {
      try {
        src = ac.createMediaStreamSource(stream);
        an = ac.createAnalyser(); an.fftSize = 512;
        src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const x of buf) m = Math.max(m, Math.abs(x - 128)); onLevel(Math.min(1, m / 80)); raf = requestAnimationFrame(tick); };
        tick();
      } catch (e) { Dbg.log(`音量表示エラー: ${e.message}`); }
    }
    const t0 = Date.now();
    recorder.start(250); // 少しずつデータを受け取る（iOS で最後のデータが欠けにくい）
    let stopped = null;
    const stop = () => {
      if (stopped) return stopped;
      stopped = new Promise((resolve) => {
        recorder.onstop = () => {
          cancelAnimationFrame(raf);
          try { if (src) src.disconnect(); } catch { /* noop */ }
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/mp4' });
          const ms = Date.now() - t0;
          Dbg.log(`録音終了 ${ms}ms ${Math.round(blob.size / 1024)}KB`);
          resolve({ blob, mime: blob.type, ms });
        };
        try { recorder.state !== 'inactive' ? recorder.stop() : recorder.onstop(); } catch { recorder.onstop(); }
      });
      return stopped;
    };
    const timer = setTimeout(() => { if (recorder.state === 'recording') { Dbg.log('最大時間で自動停止'); stop().then((r) => onAutoStop && onAutoStop(r)); } }, maxMs);
    return { stop: () => { clearTimeout(timer); return stop(); }, mime: recorder.mimeType };
  }

  // 録音した音を 16kHz・モノラルの数値の並びにする（ブラウザ内の発音判定で使う）
  async function toPCM16k(blob) {
    const ac = audioCtx();
    const decoded = await new Promise((resolve, reject) => {
      blob.arrayBuffer().then((buf) => ac.decodeAudioData(buf, resolve, reject)).catch(reject);
    });
    const len = Math.ceil(decoded.duration * 16000);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(1, len, 16000);
    const s = off.createBufferSource();
    s.buffer = decoded; s.connect(off.destination); s.start();
    const out = await off.startRendering();
    return out.getChannelData(0);
  }

  return { supported, start, toPCM16k, pickMime, audioCtx };
})();
