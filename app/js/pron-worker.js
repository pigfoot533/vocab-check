// 発音の判定（段階2）：重い計算を画面とは別に行うワーカー
// 音声はこの端末の中だけで処理し、どこにも送らない。モデル（約116MB）は初回だけ Hugging Face から読み込み、端末に保存する。
importScripts('../vendor/ort/ort.wasm.min.js', 'model-cache.js', 'gop.js');
const MODEL_URL = 'https://huggingface.co/ron-jo/hubert-base-phoneme-en-onnx/resolve/main/hubert_phoneme_int8.onnx';
const MODEL_CACHE = 'tango-note-model-hubert-v1';
const MODEL_SIZE = 121951866;
ort.env.wasm.wasmPaths = new URL('../vendor/ort/', self.location.href).href;
ort.env.wasm.numThreads = 1; // 複数スレッドは使わない（特別なサーバー設定が必要なため）
let session = null;
let loading = null;

function load(progress) {
  if (session) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const data = await ModelCache.get(MODEL_URL, MODEL_CACHE, MODEL_SIZE, progress, '判定用のデータ');
      progress({ phase: 'prepare' });
      session = await ort.InferenceSession.create(data, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}
async function judge(data, progress) {
  const { pcm, phon, stress } = data;
  await load(progress);
  const cut = GOP.trim(pcm);
  if (!cut) return { silent: true };
  if (cut.length < 16000 * 0.25) return { tooShort: true };
  progress({ phase: 'run' });
  const x = GOP.normalize(cut);
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', x, [1, x.length]) });
  const lg = out[session.outputNames[0]];
  const [, T, C] = lg.dims;
  const res = GOP.score(lg.data, T, C, phon, stress, cut);
  res.seconds = Math.round((cut.length / 16000) * 10) / 10;
  if (data.debug) res.debug = { logits: lg.data, T, C, pcm: cut }; // 基準の調整用
  return res;
}

self.onmessage = async (e) => {
  const { id, type, data } = e.data;
  const progress = (p) => self.postMessage({ id, progress: p });
  try {
    let result;
    if (type === 'cached') result = await ModelCache.has(MODEL_URL, MODEL_CACHE);
    else if (type === 'load') { await load(progress); result = true; }
    else if (type === 'judge') result = await judge(data, progress);
    else if (type === 'clear') { session = null; loading = null; await ModelCache.remove(MODEL_CACHE); result = true; }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
