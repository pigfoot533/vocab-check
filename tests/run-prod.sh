# 本番の設定でテストする（ポート 8791：GASの代わり、8792：アプリ）
cd "$(dirname "$0")"; fuser -k 8791/tcp 8792/tcp >/dev/null 2>&1
(PROD=1 WORDS=$PWD/words-752.json ME=teacher@example.com NAME=笹川 node gasmock.js > gas.log 2>&1 &); (cd .. && python3 -m http.server 8792 >/dev/null 2>&1 &); sleep 1.5
timeout 600 node e2e-prod.js 2>&1 | grep -v "^\s*\(at \|\[\|'\)" | head -30
fuser -k 8791/tcp 8792/tcp >/dev/null 2>&1; exit 0
