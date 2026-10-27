// 判定用AIのダウンロード・保存・実行（画面とは別のスレッドで動く）
// 判定を動かすプログラム（ONNX Runtime Web）は、アプリと同じ場所（GitHub Pages）から読み込む
const MODEL_URL = 'https://huggingface.co/ron-jo/hubert-base-phoneme-en-onnx/resolve/main/hubert_phoneme_int8.onnx';
const MODEL_SIZE = 121951866;
const MODEL_CACHE = 'check-model-hubert-v1';
let ortReady = false;

function loadOrt() {
  if (ortReady) return;
  importScripts('../vendor/ort/ort.wasm.min.js');
  ort.env.wasm.wasmPaths = new URL('../vendor/ort/', self.location.href).href;
  ort.env.wasm.numThreads = 1;
  ortReady = true;
}

async function download() {
  const t0 = Date.now();
  let r;
  try { r = await fetch(MODEL_URL); } catch (e) { throw new Error('huggingface.co に接続できませんでした。フィルターで止められている可能性があります（' + e + '）'); }
  if (!r.ok) throw new Error('huggingface.co からの読み込みに失敗しました（HTTP ' + r.status + '）');
  const total = Number(r.headers.get('content-length')) || MODEL_SIZE;
  const rd = r.body.getReader();
  let chunks = [], got = 0, last = 0, first5 = 0;
  for (;;) {
    const x = await rd.read();
    if (x.done) break;
    chunks.push(x.value); got += x.value.length;
    if (!first5 && got >= 5 * 1048576) first5 = Date.now() - t0;
    if (Date.now() - last > 300) { last = Date.now(); postMessage({ p: got / total, got, total, sec: (Date.now() - t0) / 1000 }); }
  }
  const data = new Uint8Array(got);
  let o = 0;
  for (const ch of chunks) { data.set(ch, o); o += ch.length; }
  chunks = null;
  const sec = (Date.now() - t0) / 1000;
  let saved;
  try {
    const c = await caches.open(MODEL_CACHE);
    await c.put(MODEL_URL, new Response(data, { headers: { 'Content-Type': 'application/octet-stream', 'X-Saved': String(Date.now()) } }));
    saved = '保存しました';
  } catch (e) { saved = '保存できませんでした（' + e + '）'; }
  return { mb: Math.round(got / 1048576), sec: Math.round(sec), mbps: Math.round(got * 8 / 1e6 / sec * 10) / 10, first5: Math.round(first5 / 100) / 10, saved };
}

async function run() {
  const c = await caches.open(MODEL_CACHE);
  const hit = await c.match(MODEL_URL);
  if (!hit) return { nocache: true };
  const t0 = Date.now();
  loadOrt();
  const tOrt = Date.now() - t0;
  const savedAt = Number(hit.headers.get('X-Saved')) || 0;
  let data = new Uint8Array(await hit.arrayBuffer());
  const tRead = Date.now() - t0 - tOrt;
  const s = await ort.InferenceSession.create(data, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  data = null;
  const tLoad = Date.now() - t0 - tOrt - tRead;
  const x = new Float32Array(16000);
  for (let i = 0; i < x.length; i++) x[i] = (Math.random() - 0.5) * 0.01;
  const t1 = Date.now();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x, [1, x.length]) });
  const tRun = Date.now() - t1;
  return { savedAt, tOrt, tRead, tLoad, tRun, dims: out[s.outputNames[0]].dims.join('×') };
}

onmessage = async (e) => {
  try {
    let r = null;
    if (e.data === 'download') r = await download();
    else if (e.data === 'run') r = await run();
    else if (e.data === 'has') r = { has: !!(await (await caches.open(MODEL_CACHE)).match(MODEL_URL)) };
    else if (e.data === 'clear') { await caches.delete(MODEL_CACHE); r = { cleared: true }; }
    postMessage({ done: r });
  } catch (err) {
    postMessage({ error: String((err && err.message) || err) });
  }
};
