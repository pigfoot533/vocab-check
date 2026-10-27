# 発音判定キット：クレジットとライセンス

アプリの「このアプリについて」などに、次の内容を表示してください。

- **音素認識 AI モデル**：hubert-base-phoneme-en（Peacockery）を ONNX 形式に変換した ron-jo/hubert-base-phoneme-en-onnx
  — Apache License 2.0 — https://huggingface.co/ron-jo/hubert-base-phoneme-en-onnx
  （モデルはキットに含まれていません。初回利用時に、利用者の端末が Hugging Face から直接ダウンロードします）
- **音声合成 AI モデル**：Kokoro-82M（hexgrad）を ONNX 形式にした onnx-community/Kokoro-82M-v1.0-ONNX（8ビット版）と声のデータ af_heart・am_michael
  — Apache License 2.0 — https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
  （キットに含まれていません。初回利用時に、利用者の端末が Hugging Face から直接ダウンロードします）
- **ONNX Runtime Web 1.20.1**（Microsoft）— MIT License — 全文は vendor/ort/LICENSE.txt
- **CMU Pronouncing Dictionary**（Carnegie Mellon University）— BSD License — dict/pron の発音データの元
- **Moby Hyphenator II**（Grady Ward）— パブリックドメイン — dict/pron の音節区切りの元
- 辞書にない語の発音推定（js/g2p.js）・採点・表示・録音・音声合成の窓口のコード（js/ 内）— 英単語学習アプリ「The Legend of English Vocabulary」から取り出したもの
