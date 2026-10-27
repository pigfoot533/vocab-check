// ▼ 設置するときに書きかえる場所（手順書の「3. つなぐ」を参照）
window.CHECK_CONFIG = {
  // GAS「ログイン用」デプロイのURL（アクセス：学校内の全員）
  GAS_LOGIN_URL: 'https://script.google.com/a/macros/aikogakuen.net/s/AKfycbyQOv9zg_NhWT7CYAJ1HG8EH5iUvpjtlz6wblNhB2nhslV61sK5nmHbYGcfkqMwcQLhlg/exec',
  // GAS「受け取り用」デプロイのURL（アクセス：全員）
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbywqWQz__mbXFfeQobV5B7Va1qGy38OR5ZHTnO9YdWysSkACsisfqD3xKc75bzeDS4BtQ/exec',
  // （任意）Googleフォームで送る方式も試す場合
  //   FORM_ACTION：https://docs.google.com/forms/d/e/〇〇/formResponse
  //   FORM_ENTRY ：記録を入れる質問の entry 番号（例：entry.123456789）
  FORM_ACTION: '',
  FORM_ENTRY: ''
};
