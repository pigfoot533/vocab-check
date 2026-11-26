cd "$(dirname "$0")"; fuser -k 8791/tcp 8792/tcp >/dev/null 2>&1
(PROD=1 WORDS=$PWD/words-752.json ME=teacher@example.com NAME=笹川 node gasmock.js > gas.log 2>&1 &); (cd .. && python3 -m http.server 8792 >/dev/null 2>&1 &); sleep 1.5
timeout 120 node shot-map.js 2>&1 | tail -3
fuser -k 8791/tcp 8792/tcp >/dev/null 2>&1; exit 0
