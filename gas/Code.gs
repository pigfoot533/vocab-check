// 英単語アプリ 動作確認（案A）のサーバー側
// スプレッドシートの「拡張機能 → Apps Script」に貼り付けて使います。
//
// しくみ：
//  ・ログイン用（学校内の全員がアクセスできるデプロイ）
//      学校のアカウントで開くと、その人専用の「通行証」を作り、アプリ（GitHub Pages）に戻す
//  ・受け取り用（全員がアクセスできるデプロイ）
//      アプリから届いた記録を、通行証を確かめてからシートに書き込む
//  通行証は、このスクリプトだけが知っている秘密の鍵で署名するので、生徒が書きかえると無効になる

// ▼ アプリを置いた場所（GitHub Pages のURLの先頭）。ここ以外には通行証を渡さない
const ALLOWED_RETURN = 'https://pigfoot533.github.io/vocab-check/';

const TOKEN_DAYS = 60; // 通行証の有効日数

// ---------- ログイン用 ----------
function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  const ret = (e && e.parameter && e.parameter.return) || '';
  const t = HtmlService.createTemplateFromFile('login');
  t.email = email;
  t.ok = !!email && ret.indexOf(ALLOWED_RETURN) === 0;
  t.reason = !email ? '学校のGoogleアカウントでログインしてから開いてください。'
    : ret.indexOf(ALLOWED_RETURN) !== 0 ? 'アプリからこのページを開いてください（戻り先が登録されていません）。' : '';
  t.backUrl = t.ok ? ret.split('#')[0] + '#token=' + encodeURIComponent(makeToken_(email)) : '';
  return t.evaluate()
    .setTitle('ログイン')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- 受け取り用 ----------
function doPost(e) {
  const t0 = Date.now();
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '形式が正しくありません' }); }
  const who = verifyToken_(body.token);
  if (!who) return json_({ ok: false, error: '通行証が無効です。もう一度ログインしてください' });
  const now = new Date();
  const serverTime = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  try {
    if (body.action === 'whoami' || body.action === 'ping') {
      return json_({ ok: true, email: who, serverTime: serverTime, ms: Date.now() - t0 });
    }
    if (body.action === 'log') {
      appendRow_('ログ', ['受信時刻', 'メール', '内容'], [now, who, JSON.stringify(body.data || {})]);
      return json_({ ok: true, serverTime: serverTime, ms: Date.now() - t0 });
    }
    if (body.action === 'result') {
      const r = (body.data && body.data.results) || {};
      const keys = Object.keys(r);
      appendRow_('結果', ['受信時刻', 'メール', '開き方', '端末'].concat(keys),
        [now, who, body.data.mode || '', body.data.ua || ''].concat(keys.map(function (k) { return r[k]; })));
      return json_({ ok: true, serverTime: serverTime, ms: Date.now() - t0 });
    }
    return json_({ ok: false, error: '不明な操作です' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------- 部品 ----------
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function appendRow_(name, header, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(header); sh.setFrozenRows(1); }
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SECRET', s); }
  return s;
}

function b64_(bytesOrString) {
  return Utilities.base64EncodeWebSafe(bytesOrString).replace(/=+$/, '');
}

function sign_(payload) {
  return b64_(Utilities.computeHmacSha256Signature(payload, secret_()));
}

function makeToken_(email) {
  const payload = email + '|' + Date.now();
  return b64_(Utilities.newBlob(payload).getBytes()) + '.' + sign_(payload);
}

function verifyToken_(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  let payload;
  try {
    const pad = parts[0] + '==='.slice((parts[0].length + 3) % 4);
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString();
  } catch (e) { return null; }
  if (sign_(payload) !== parts[1]) return null;
  const p = payload.split('|');
  if (Date.now() - Number(p[1]) > TOKEN_DAYS * 86400000) return null;
  return p[0];
}

// 最初に一度だけ手動で実行すると、権限の確認と秘密の鍵の作成が済む
function setup() {
  secret_();
  Logger.log('準備ができました');
}
