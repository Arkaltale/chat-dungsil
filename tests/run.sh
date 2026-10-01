#!/bin/sh
# 브라우저 회귀 스위트를 headless Chromium 에서 실행한다.
# 사용법: sh tests/run.sh [스위트...]   (인자가 없으면 전체 실행)
set -u

TESTS_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$TESTS_DIR/.." && pwd)
GEN_DIR="$TESTS_DIR/.generated"
CONFIG="$GEN_DIR/cli.headless.config.json"
ALL_SUITES="interaction platform usability popup font pip watch header"
# README 의 브라우저 설치 명령도 같은 버전을 쓴다.
PLAYWRIGHT_CLI_VERSION=0.1.22

if ! command -v npx >/dev/null 2>&1; then
  echo "오류: npx 를 찾을 수 없습니다. Node.js 를 설치하세요." >&2
  exit 2
fi

case "$ROOT" in
  *'|'*|*'\'*|*'"'*|*'&'*) echo "오류: 저장소 경로에 | \\ \" & 문자가 있으면 설정을 만들 수 없습니다: $ROOT" >&2; exit 2 ;;
esac

mkdir -p "$GEN_DIR" || exit 2
sed "s|__EXTENSION_ROOT__|$ROOT|g" "$TESTS_DIR/cli.headless.config.template.json" > "$CONFIG" || exit 2

if [ $# -eq 0 ]; then
  set -- $ALL_SUITES
fi
for suite in "$@"; do
  if [ ! -f "$TESTS_DIR/$suite-regressions.js" ]; then
    echo "오류: 알 수 없는 스위트 '$suite' (사용 가능: $ALL_SUITES)" >&2
    exit 2
  fi
done

pw() {
  npx --yes --package "@playwright/cli@$PLAYWRIGHT_CLI_VERSION" playwright-cli "$@"
}

# run-code 출력에서 {"pass":...} JSON 줄을 찾아 한 줄 요약을 출력한다. 통과면 0.
summarize() {
  suite=$1
  out=$2
  line=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*\{"pass":(true|false)' | tail -n 1)
  if [ -z "$line" ]; then
    echo "FAIL $suite: 결과 JSON 을 찾지 못했습니다. 출력 앞부분:"
    printf '%s\n' "$out" | head -n 40 | sed 's/^/    /'
    return 1
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "$line" | SUITE="$suite" python3 -c '
import json, os, sys
suite = os.environ["SUITE"]
try:
    data = json.loads(sys.stdin.read().strip())
except Exception as error:
    print("FAIL %s: 결과 JSON 해석 실패 (%s)" % (suite, error))
    sys.exit(1)
results = data.get("results") or []
failed = [str(item.get("name")) for item in results if not item.get("pass")]
ok = data.get("pass") is True and not failed
line = "%s %s: %d/%d 통과" % ("PASS" if ok else "FAIL", suite, len(results) - len(failed), len(results))
if failed:
    line += " | 실패: " + ", ".join(failed)
print(line)
sys.exit(0 if ok else 1)
'
    return $?
  fi
  total=$(printf '%s\n' "$line" | grep -o '"pass":' | wc -l | tr -d ' ')
  total=$((total - 1))
  if printf '%s\n' "$line" | grep -q '^[[:space:]]*{"pass":true' &&
     ! printf '%s\n' "$line" | grep -q '"pass":false'; then
    echo "PASS $suite: 항목 약 $total 개 (python3 없음, 간이 판정)"
    return 0
  fi
  echo "FAIL $suite: 항목 약 $total 개 (python3 없음, 실패 항목 이름은 원본 JSON 확인)"
  printf '%s\n' "$line" | cut -c 1-2000 | sed 's/^/    /'
  return 1
}

failures=0
for suite in "$@"; do
  session="chat-$suite"
  pw -s="$session" close >/dev/null 2>&1
  open_out=$(pw -s="$session" open about:blank --config="$CONFIG" --persistent 2>&1)
  if [ $? -ne 0 ]; then
    echo "FAIL $suite: 브라우저를 열지 못했습니다."
    printf '%s\n' "$open_out" | head -n 40 | sed 's/^/    /'
    failures=$((failures + 1))
    continue
  fi
  out=$(cd "$ROOT" && pw -s="$session" run-code --filename="tests/$suite-regressions.js" 2>&1)
  summarize "$suite" "$out" || failures=$((failures + 1))
  pw -s="$session" close >/dev/null 2>&1
done

if [ "$failures" -ne 0 ]; then
  echo "실패한 스위트: $failures"
  exit 1
fi
echo "모든 스위트 통과"
