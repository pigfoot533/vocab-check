cd "$(dirname "$0")"; fuser -k 8791/tcp 8792/tcp >/dev/null 2>&1
(PROD=1 WORDS=$PWD/words-752.json COURSE=発展 COURSE_WORDS=$PWD/words-course-sample.json ME=teacher@example.com NAME=笹川 node gasmock.js > gas.log 2>&1 &); (cd .. && python3 -m http.server 8792 >/dev/null 2>&1 &); sleep 1.5
timeout 180 node e2e-course.js 2>&1 | grep -v "^\s*at " | head -30
fuser -k 8791/tcp 8792/tcp >/dev/null 2>&1; exit 0
