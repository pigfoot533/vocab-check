// ▼ 設置するときに書きかえる場所（手順書の「3. つなぐ」を参照）
window.CHECK_CONFIG = {
  // GAS「ログイン用」デプロイのURL（アクセス：学校内の全員）
  GAS_LOGIN_URL: 'https://script.google.com/a/macros/aikogakuen.net/s/AKfycbzUI0aQzOu6eg4LEK2xkuzPQd188l_JpGjy-a2cuKGCjN31918uxYPhEhgqskO2aMRQbA/exec',
  // GAS「受け取り用」デプロイのURL（アクセス：全員）
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbyv-sGOPgW1En_o_f0ndmchrmNxCfjIXqNGjMzlulKMDBfUK2Uf5kke1Qpnd8bjkL_Rnw/exec',
  // （任意）Googleフォームで送る方式も試す場合
  //   FORM_ACTION：https://docs.google.com/forms/d/e/〇〇/formResponse
  //   FORM_ENTRY ：記録を入れる質問の entry 番号（例：entry.123456789）
  FORM_ACTION: '',
  FORM_ENTRY: ''
};
