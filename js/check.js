// 動作確認（案A：GitHub Pages ＋ GAS）
(function () {
  'use strict';
  var CFG = window.CHECK_CONFIG || {};
  var KEYS = ['ログイン', '記録の送信', 'フォーム送信', 'マイク', '録音', 'お手本→録音', '計算の仕組み', '保存', 'アプリ本体の保存', 'AIのダウンロード', 'AIの実行', '手書き', '画面切替の検知', '結果の送信'];
  var R = {};
  KEYS.forEach(function (k) { R[k] = '未実施'; });
  var $ = function (id) { return document.getElementById(id); };

  function set(key, state, text) {
    R[key] = (state === 'ok' ? '○ ' : state === 'ng' ? '× ' : '△ ') + text.replace(/\n/g, ' / ');
    var st = $('st-' + key);
    if (st) { st.className = 'st ' + state; st.textContent = state === 'ok' ? 'OK' : state === 'ng' ? 'NG' : '要確認'; }
    note(key, text);
    summary();
  }
  function note(key, text) { var o = $('out-' + key); if (o) o.textContent = text; }
  function errText(e) { return (e && ((e.name ? e.name + ': ' : '') + (e.message || ''))) || String(e); }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* なし */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---------- 0. 環境 ----------
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var mode = standalone ? 'ホーム画面から' : 'ブラウザで';
  function showEnv() {
    $('env').textContent = [
      '開き方：' + mode,
      '場所：' + location.origin + location.pathname,
      '端末：' + navigator.userAgent,
      '安全な接続(HTTPS)：' + (window.isSecureContext ? 'はい' : 'いいえ'),
      '設定：ログイン用URL ' + (CFG.GAS_LOGIN_URL ? 'あり' : '未設定') + '／受け取り用URL ' + (CFG.GAS_API_URL ? 'あり' : '未設定') + '／フォーム ' + (CFG.FORM_ACTION ? 'あり' : '未設定')
    ].join('\n');
  }
  showEnv();

  // ---------- 1. ログイン（通行証） ----------
  var m = location.hash.match(/token=([^&]+)/);
  if (m) {
    store('check-token', decodeURIComponent(m[1]));
    history.replaceState(null, '', location.pathname + location.search); // 通行証をアドレス欄から消す
  }
  var token = load('check-token');

  function api(action, data) {
    if (!CFG.GAS_API_URL) return Promise.reject(new Error('受け取り用URLが設定されていません（config.js）'));
    var t0 = performance.now();
    // text/plain で送る（事前確認の通信が発生しない、いちばん単純な送り方）
    return fetch(CFG.GAS_API_URL, { method: 'POST', body: JSON.stringify({ token: token, action: action, data: data || null }) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { j.clientMs = Math.round(performance.now() - t0); return j; });
  }

  function checkLogin() {
    if (!token) { note('ログイン', 'まだログインしていません'); return; }
    note('ログイン', '確認中…');
    api('whoami').then(function (j) {
      if (j.ok) set('ログイン', 'ok', j.email + ' として識別できました（サーバーの時刻 ' + j.serverTime + '、' + j.clientMs + 'ミリ秒）');
      else set('ログイン', 'ng', j.error);
    }).catch(function (e) {
      set('ログイン', 'ng', '受け取り用GASに接続できません：' + errText(e) + '\n（「全員」に公開できない設定の可能性）');
    });
  }
  checkLogin();

  $('btn-login').onclick = function () {
    if (!CFG.GAS_LOGIN_URL) { set('ログイン', 'ng', 'ログイン用URLが設定されていません（config.js）'); return; }
    location.href = CFG.GAS_LOGIN_URL + '?return=' + encodeURIComponent(location.origin + location.pathname);
  };
  $('btn-logout').onclick = function () { store('check-token', null); token = null; note('ログイン', 'ログアウトしました'); };

  // ---------- 2. 記録の送信（GAS） ----------
  $('btn-send').onclick = function () {
    var b = this; b.disabled = true;
    note('記録の送信', '1回目を送信中…');
    api('log', { test: 'single', at: Date.now() }).then(function (j) {
      if (!j.ok) throw new Error(j.error);
      var single = j.clientMs;
      note('記録の送信', '1回目OK（' + single + 'ミリ秒）。10回まとめて送信中…');
      var jobs = [];
      for (var i = 0; i < 10; i++) jobs.push(api('log', { test: 'burst', n: i }).then(function (x) { return x; }, function (e) { return { ok: false, error: errText(e) }; }));
      return Promise.all(jobs).then(function (rs) {
        var okN = rs.filter(function (x) { return x.ok; }).length;
        var max = Math.max.apply(null, rs.map(function (x) { return x.clientMs || 0; }));
        var errs = rs.filter(function (x) { return !x.ok; }).map(function (x) { return x.error; });
        set('記録の送信', okN === 10 ? 'ok' : 'mid',
          '1回の送信：' + single + 'ミリ秒\n10回同時：' + okN + '/10 成功、いちばん遅いもの ' + max + 'ミリ秒' + (errs.length ? '\n失敗：' + errs[0] : ''));
      });
    }).catch(function (e) {
      set('記録の送信', 'ng', errText(e));
    }).then(function () { b.disabled = false; });
  };

  // ---------- 3. Googleフォーム（任意） ----------
  if (!CFG.FORM_ACTION) { $('btn-form').disabled = true; note('フォーム送信', '設定されていないため省略します'); R['フォーム送信'] = '省略'; }
  $('btn-form').onclick = function () {
    var body = new URLSearchParams();
    body.append(CFG.FORM_ENTRY, JSON.stringify({ test: 'form', at: new Date().toISOString() }));
    fetch(CFG.FORM_ACTION, { method: 'POST', mode: 'no-cors', body: body })
      .then(function () { set('フォーム送信', 'mid', '送信しました。届いたかどうかは、フォームの回答シートで確認してください'); })
      .catch(function (e) { set('フォーム送信', 'ng', errText(e)); });
  };

  // ---------- 4. マイク ----------
  var micStream = null, audioCtx = null;
  function ctx() {
    if (!audioCtx) { var C = window.AudioContext || window.webkitAudioContext; audioCtx = new C(); }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function getMic() {
    if (micStream && micStream.getAudioTracks().some(function (t) { return t.readyState === 'live'; })) return Promise.resolve(micStream);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('この画面ではマイクの機能が使えません'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (s) { micStream = s; return s; });
  }
  // 使い終わったらマイクを切る（iPad右上のオレンジの点を消す）
  function releaseMic() {
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
  }
  window.addEventListener('pagehide', releaseMic);
  $('btn-mic').onclick = function () {
    var c = ctx();
    note('マイク', '許可を待っています…');
    getMic().then(function (stream) {
      var an = c.createAnalyser(); an.fftSize = 1024; c.createMediaStreamSource(stream).connect(an);
      var buf = new Float32Array(an.fftSize), peak = 0, t0 = Date.now();
      note('マイク', 'つながりました。声を出してください（5秒）…');
      (function loop() {
        an.getFloatTimeDomainData(buf);
        var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        var lv = Math.min(1, Math.sqrt(s / buf.length) * 8);
        peak = Math.max(peak, lv);
        $('meter').style.width = Math.round(lv * 100) + '%';
        if (Date.now() - t0 < 5000) requestAnimationFrame(loop);
        else {
          $('meter').style.width = '0';
          releaseMic();
          if (peak > 0.15) set('マイク', 'ok', 'マイクが使え、声も入りました（最大音量 ' + peak.toFixed(2) + '）');
          else set('マイク', 'mid', 'つながりましたが、声がほとんど入りませんでした（最大音量 ' + peak.toFixed(2) + '）');
        }
      })();
    }).catch(function (e) {
      releaseMic();
      set('マイク', 'ng', errText(e) + (e && e.name === 'NotAllowedError' ? '（許可されませんでした）' : ''));
    });
  };

  // ---------- 5. 録音 ----------
  function recordFor(ms) {
    return getMic().then(function (stream) {
      if (!window.MediaRecorder) throw new Error('録音の機能（MediaRecorder）がありません');
      var type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].filter(function (t) { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } })[0] || '';
      return new Promise(function (res, rej) {
        var mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined), chunks = [];
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onerror = function (e) { rej(e.error || e); };
        mr.onstop = function () { releaseMic(); res(new Blob(chunks, { type: mr.mimeType || type })); };
        mr.start();
        setTimeout(function () { mr.stop(); }, ms);
      });
    });
  }
  function playBuffer(ab) {
    return new Promise(function (res) {
      var c = ctx(), src = c.createBufferSource();
      src.buffer = ab; src.connect(c.destination); src.onended = res; src.start();
    });
  }
  function decode(blob) { return blob.arrayBuffer().then(function (b) { return ctx().decodeAudioData(b); }); }

  $('btn-rec').onclick = function () {
    ctx();
    note('録音', '録音中…（3秒）');
    recordFor(3000).then(function (blob) {
      return decode(blob).then(function (ab) {
        set('録音', ab.duration > 1.5 ? 'ok' : 'mid', '録音できました（' + ab.duration.toFixed(1) + '秒、' + (blob.type || '形式不明') + '、' + Math.round(blob.size / 1024) + 'KB）。再生された声が聞こえたか確認してください');
        return playBuffer(ab);
      });
    }).catch(function (e) { set('録音', 'ng', errText(e)); });
  };

  // ---------- 6. お手本 → 続けて録音（ボタン1回） ----------
  $('btn-chain').onclick = function () {
    var b = this; b.disabled = true;
    ctx(); // ボタンを押した瞬間に音の準備をする（iPadの決まり）
    var t0 = Date.now(), steps = [];
    getMic().then(function () {
      steps.push('マイクOK');
      return fetch('assets/apple.mp3').then(function (r) { return r.arrayBuffer(); }).then(function (b2) { return ctx().decodeAudioData(b2); });
    }).then(function (model) {
      note('お手本→録音', 'お手本を再生中…');
      return playBuffer(model).then(function () { steps.push('お手本の再生OK'); });
    }).then(function () {
      note('お手本→録音', '録音中…「apple」と言ってください（2.5秒）');
      return recordFor(2500);
    }).then(function (blob) {
      return decode(blob).then(function (ab) {
        steps.push('録音OK（' + ab.duration.toFixed(1) + '秒）');
        note('お手本→録音', '録音を再生中…');
        return playBuffer(ab);
      });
    }).then(function () {
      note('お手本→録音', steps.join('／') + '（全体 ' + ((Date.now() - t0) / 1000).toFixed(1) + '秒）\nお手本と自分の声が聞こえたかを押してください');
      R['お手本→録音'] = '△ ' + steps.join('／') + '（聞こえたかは未回答）'; summary();
    }).catch(function (e) {
      releaseMic();
      set('お手本→録音', 'ng', steps.join('／') + ' のあとで失敗：' + errText(e));
    }).then(function () { b.disabled = false; });
  };
  $('btn-chain-yes').onclick = function () { set('お手本→録音', 'ok', 'お手本も自分の声も聞こえた（マイク使用中のお手本の音量も問題なし）'); };
  $('btn-chain-no').onclick = function () { set('お手本→録音', 'ng', 'どちらかが聞こえない（マイク使用中に音が小さくなる可能性）'); };

  // ---------- 7. 計算の仕組み ----------
  (function () {
    var res = [];
    var simd = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
    var hasWasm = typeof WebAssembly === 'object';
    var hasSimd = hasWasm && WebAssembly.validate(simd);
    res.push('WebAssembly：' + (hasWasm ? 'あり' : 'なし') + '／高速計算(SIMD)：' + (hasSimd ? 'あり' : 'なし'));
    fetch('vendor/ort/ort-wasm-simd-threaded.wasm', { method: 'HEAD' }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      res.push('判定用プログラムの配信：' + (r.ok ? 'OK（' + ct + '）' : 'HTTP ' + r.status));
      return r.ok && /wasm/.test(ct);
    }).catch(function () { res.push('判定用プログラムの配信：取得できません'); return false; }).then(function (served) {
      var w;
      try { w = new Worker('workers/ai-worker.js'); } catch (e) { set('計算の仕組み', 'ng', res.concat('Worker：作れません ' + errText(e)).join('\n')); return; }
      var timer = setTimeout(function () { set('計算の仕組み', 'ng', res.concat('Worker：応答なし').join('\n')); w.terminate(); }, 8000);
      w.onmessage = function (e) {
        clearTimeout(timer); w.terminate();
        if (e.data.error) { set('計算の仕組み', 'ng', res.concat('Worker：' + e.data.error).join('\n')); return; }
        res.push('Worker：OK／保存済みのAI：' + (e.data.done.has ? 'あり' : 'なし'));
        set('計算の仕組み', hasWasm && hasSimd && served ? 'ok' : 'ng', res.join('\n'));
      };
      w.onerror = function (e) { clearTimeout(timer); set('計算の仕組み', 'ng', res.concat('Worker：エラー ' + (e.message || '')).join('\n')); };
      w.postMessage('has');
    });
  })();

  // ---------- 8. 端末への保存 ----------
  function fmt(t) { if (!t) return 'なし'; var d = new Date(Number(t)); return d.toLocaleString('ja-JP') + '（' + Math.round((Date.now() - d) / 360000) / 10 + '時間前）'; }
  function idbGetSet(v) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open('check-db', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
        rq.onerror = function () { res({ err: String(rq.error) }); };
        rq.onsuccess = function () {
          var tx = rq.result.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), g = st.get('marker');
          g.onsuccess = function () { st.put(v, 'marker'); tx.oncomplete = function () { res({ prev: g.result }); }; };
          tx.onerror = function () { res({ err: String(tx.error) }); };
        };
      } catch (e) { res({ err: errText(e) }); }
    });
  }
  function cacheGetSet(v) {
    if (typeof caches === 'undefined') return Promise.resolve({ err: 'Cache Storageなし' });
    var key = new Request(location.origin + '/__check-marker');
    return caches.open('check-marker').then(function (c) {
      return c.match(key).then(function (h) { return h ? h.text() : null; }).then(function (prev) {
        return c.put(key, new Response(String(v))).then(function () { return { prev: prev }; });
      });
    }).catch(function (e) { return { err: errText(e) }; });
  }
  function checkStorage() {
    var now = Date.now(), ls = { prev: load('check-marker') };
    try { localStorage.setItem('check-marker', String(now)); } catch (e) { ls.err = errText(e); }
    Promise.all([idbGetSet(now), cacheGetSet(now),
      navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null),
      navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null)
    ]).then(function (r) {
      var idb = r[0], cs = r[1], est = r[2], per = r[3];
      var line = function (n, x) { return n + '：' + (x.err ? '使えない（' + x.err + '）' : '前回の記録 ' + fmt(x.prev)); };
      var usable = !ls.err && !idb.err && !cs.err, hadPrev = ls.prev || idb.prev || cs.prev;
      var big = !est || est.quota > 300 * 1048576;
      var head = !usable ? '保存できない種類があります。' : !big ? '容量が足りない可能性があります（AIに約120MB必要）。' : hadPrev ? '前回の記録が残っていました。' : '初回です。翌日にもう一度開いてください。';
      set('保存', !usable || !big ? 'ng' : hadPrev ? 'ok' : 'mid', [head, line('簡易保存', ls), line('データベース', idb), line('ファイル保存', cs),
        '容量の目安：' + (est ? Math.round(est.quota / 1048576) + 'MB（使用中 ' + Math.round(est.usage / 1048576) + 'MB）' : '不明'),
        '消されにくい設定：' + (per === null ? '不明' : per ? 'オン' : 'オフ')].join('\n'));
    });
  }
  checkStorage();
  $('btn-persist').onclick = function () {
    if (!navigator.storage || !navigator.storage.persist) { note('保存', 'この端末では設定できません'); return; }
    navigator.storage.persist().then(checkStorage);
  };

  // ---------- 9. アプリ本体の保存（Service Worker） ----------
  (function () {
    if (!('serviceWorker' in navigator)) { set('アプリ本体の保存', 'ng', 'この端末では使えません（Service Workerなし）'); return; }
    var was = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () {
      return caches.open('check-shell-v2').then(function (c) { return c.keys(); });
    }).then(function (keys) {
      var txt = '保存したファイル：' + keys.length + '個\n' + (was ? '今回は保存したアプリ本体から開きました。' : '初回です。もう一度読み込むと、保存したアプリ本体から開きます。') + '\n開き方：' + mode;
      set('アプリ本体の保存', was ? 'ok' : 'mid', txt);
    }).catch(function (e) { set('アプリ本体の保存', 'ng', errText(e)); });
  })();

  // ---------- 10・11. 判定用AI ----------
  function aiWorker(cmd, onMsg) {
    var w;
    try { w = new Worker('workers/ai-worker.js'); } catch (e) { onMsg({ error: 'Workerを作れません：' + errText(e) }); return; }
    w.onmessage = function (e) { onMsg(e.data); if (e.data.done || e.data.error) w.terminate(); };
    w.onerror = function (e) { onMsg({ error: 'エラー：' + (e.message || '不明') }); w.terminate(); };
    w.postMessage(cmd);
  }
  $('btn-dl').onclick = function () {
    var b = this; b.disabled = true;
    note('AIのダウンロード', '開始しています…');
    aiWorker('download', function (m) {
      if (m.p !== undefined) {
        $('dlbar').style.width = Math.round(m.p * 100) + '%';
        note('AIのダウンロード', Math.round(m.got / 1048576) + ' / ' + Math.round(m.total / 1048576) + 'MB（' + Math.round(m.sec) + '秒）');
      } else if (m.done) {
        b.disabled = false; $('dlbar').style.width = '100%';
        var d = m.done;
        set('AIのダウンロード', /保存しました/.test(d.saved) ? 'ok' : 'mid', d.mb + 'MBを' + d.sec + '秒で読み込み（約' + d.mbps + 'Mbps、最初の5MBまで' + d.first5 + '秒）。' + d.saved);
      } else if (m.error) { b.disabled = false; set('AIのダウンロード', 'ng', m.error); }
    });
  };
  $('btn-dl-clear').onclick = function () {
    aiWorker('clear', function (m) { note('AIのダウンロード', m.error ? '消せませんでした：' + m.error : '保存したAIを消しました'); $('dlbar').style.width = '0'; });
  };
  $('btn-run').onclick = function () {
    var b = this; b.disabled = true;
    note('AIの実行', '準備中…（古いiPadでは数十秒かかることがあります）');
    aiWorker('run', function (m) {
      if (m.done) {
        b.disabled = false;
        var d = m.done;
        if (d.nocache) { set('AIの実行', 'ng', '保存されたAIが見つかりません。先に10でダウンロードしてください（ダウンロード済みなら、保存が消されています）'); return; }
        set('AIの実行', 'ok', 'AIが動きました。保存日時 ' + fmt(d.savedAt) + '\n読み出し ' + (d.tRead / 1000).toFixed(1) + '秒／準備 ' + (d.tLoad / 1000).toFixed(1) + '秒／判定1回 ' + (d.tRun / 1000).toFixed(2) + '秒（出力 ' + d.dims + '）');
      } else if (m.error) { b.disabled = false; set('AIの実行', 'ng', m.error); }
    });
  };

  // ---------- 12. 手書き（マス目） ----------
  var counts = { pen: 0, touch: 0, mouse: 0, ignored: 0 }, penSeen = false, cells = [];
  function padInfo() { return 'ペン ' + counts.pen + '画／指 ' + counts.touch + '画／マウス ' + counts.mouse + '画／ペン使用中に無視した指 ' + counts.ignored + '回'; }
  function makeCell() {
    var cv = document.createElement('canvas'), g = cv.getContext('2d'), live = {};
    $('boxes').appendChild(cv);
    function fit() {
      var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1f2328';
      g.clearRect(0, 0, r.width, r.height);
      g.strokeStyle = '#d0d7de'; g.lineWidth = 1; g.setLineDash([4, 4]); // 4線の目安
      [0.3, 0.55, 0.8].forEach(function (y) { g.beginPath(); g.moveTo(0, r.height * y); g.lineTo(r.width, r.height * y); g.stroke(); });
      g.setLineDash([]); g.strokeStyle = '#1f2328'; g.lineWidth = 5;
    }
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch' && penSeen) { counts.ignored++; note('手書き', padInfo()); return; } // ペンの人は手のひらを無視
      counts[e.pointerType] = (counts[e.pointerType] || 0) + 1;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* なし */ }
      var r = cv.getBoundingClientRect();
      live[e.pointerId] = { x: e.clientX - r.left, y: e.clientY - r.top };
      e.preventDefault(); note('手書き', padInfo());
    });
    cv.addEventListener('pointermove', function (e) {
      var p = live[e.pointerId]; if (!p) return;
      var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(x, y); g.stroke();
      p.x = x; p.y = y; e.preventDefault();
    });
    var up = function (e) { delete live[e.pointerId]; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    fit();
    return { fit: fit };
  }
  for (var i = 0; i < 5; i++) cells.push(makeCell());
  window.addEventListener('resize', function () { cells.forEach(function (c) { c.fit(); }); });
  $('btn-pad-clear').onclick = function () { cells.forEach(function (c) { c.fit(); }); };
  $('btn-pad-ok').onclick = function () { set('手書き', 'ok', 'きれいに書けた：' + padInfo()); };
  $('btn-pad-ng').onclick = function () { set('手書き', 'ng', 'うまく書けない：' + padInfo()); };

  // ---------- 13. 画面の切り替え ----------
  var hiddenAt = 0, events = [];
  function logEv(n) { events.push(new Date().toLocaleTimeString('ja-JP') + ' ' + n); if (events.length > 8) events.shift(); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); logEv('画面を離れた'); }
    else {
      var sec = hiddenAt ? Math.round((Date.now() - hiddenAt) / 1000) : 0;
      logEv('戻ってきた（' + sec + '秒）');
      set('画面切替の検知', sec > 0 ? 'ok' : 'mid', '検知できました\n' + events.join('\n'));
    }
  });

  // ---------- 14. 結果を送る ----------
  function summary() {
    $('summary').value = ['開き方：' + mode, '端末：' + navigator.userAgent].concat(KEYS.map(function (k) { return k + '：' + R[k]; })).join('\n');
  }
  summary();
  $('btn-save').onclick = function () {
    var b = this; b.disabled = true;
    api('result', { mode: mode, ua: navigator.userAgent, results: R }).then(function (j) {
      if (!j.ok) throw new Error(j.error);
      set('結果の送信', 'ok', '記録しました（' + j.clientMs + 'ミリ秒）');
    }).catch(function (e) {
      set('結果の送信', 'ng', errText(e) + '\n「結果をコピー」で送ってください');
    }).then(function () { b.disabled = false; });
  };
  $('btn-copy').onclick = function () {
    var ta = $('summary'); ta.select();
    var done = function () { $('btn-copy').textContent = 'コピーしました'; };
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, function () { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  };
})();
