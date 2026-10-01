# 브라우저 회귀 검사

이 스크립트들은 Playwright CLI의 `run-code --filename`에 전달하는 함수입니다.
원본 확장을 실제 Chromium에 로드하고 DOM 이벤트, Fullscreen API,
`chrome.storage` 및 확장 메시지를 검사합니다. 별도 빌드는 필요하지 않습니다.

브라우저는 **headless로 실행**합니다. 테스트 중 사용자의 화면이나 포커스를
방해하지 않도록 `--headed`는 사용하지 않습니다. 개인 Chrome 프로필도 사용하지 않습니다.

## 사전 조건

- Node.js(`npx` 포함). `run.sh`는 `npx --yes --package @playwright/cli@0.1.22 playwright-cli`를
  직접 호출하므로 처음 실행할 때 `@playwright/cli`를 내려받습니다. 버전은 `run.sh`의
  `PLAYWRIGHT_CLI_VERSION`과 이 문서의 두 명령에 함께 적혀 있으므로, 바꿀 때는 세 곳을 같이 맞춥니다.
- Playwright Chromium. 설치되어 있지 않다면 `@playwright/cli`와 같은 버전으로 한 번 설치합니다.

```sh
npx --yes --package @playwright/cli@0.1.22 playwright-cli install-browser chromium
```

## 실행

저장소 어디서든, 다른 작업 디렉터리에서도 실행할 수 있습니다.

```sh
sh tests/run.sh            # 8개 스위트 전체
sh tests/run.sh pip watch  # 지정한 스위트만
```

- `run.sh`는 스크립트 위치로 저장소 루트를 찾아
  `tests/cli.headless.config.template.json`의 확장 경로를 채운 설정을
  `tests/.generated/`에 만듭니다.
- 스위트마다 `chat-<스위트>` 세션을 새로 열고 검사 후 닫으며,
  스위트별로 통과 여부·항목 수·실패 항목 이름을 한 줄로 출력합니다.
  하나라도 실패하면 0이 아닌 종료 코드로 끝납니다.
- 확장 ID는 설치 경로에서 파생되므로 테스트가 실행 중에 얻습니다.
  각 스크립트는 치지직 fixture 페이지에 CDP `Runtime.enable`을 걸고
  확장 isolated world의 `origin`(`chrome-extension://<ID>`)에서 ID를 읽습니다.

## 스위트

- `interaction-regressions.js`: 이미 채팅 위에 있는 마우스의 호버 상태,
  드래그·크기 조절 중 해제와 재조작, iframe 안쪽으로의 축소와 입력 복구,
  확장 런타임 예외를 검사합니다.
- `platform-regressions.js`: 치지직 클래스 변경·숨김·DOM 교체와 전체화면 상태,
  유튜브 채팅 패널과 iframe 높이, 전체화면 영상 폭 및 복구, 글자 크기 도구만 남은 빈 컨테이너와
  확장 자체 UI를 채팅으로 오인하지 않는지를 검사합니다.
- `usability-regressions.js`: 모드별 위치, 화면 경계, T 자동 분리, 잠금·숨김, T 위치를 저장한 적 없을 때 일반 위치 승계, 같은 사이트 두 탭 사이 설정 동기화와 드래그 중 수신 보류를 검사합니다.
- `popup-regressions.js`: 버전 일치·불일치 안내, 모드·탐지 상태, 설정 제어 메시지, 치지직·유튜브 채팅 팝업 전용 모드 표시를 검사합니다. 팝업 UI 검사는 상태 응답을 모의합니다.
- `font-regressions.js`: 사이트별 글자 크기 저장·적용·기본값 복원과 native 채팅 iframe 동기화, 유튜브 채팅 팝아웃 창 전용 모드와 툴바를 검사합니다.
- `pip-regressions.js`: 팝업 스위치와 독립 채팅 iframe, OFF·X·URL 변경·DOM 교체 복원, 전체화면·글꼴, 연속 요청과 오류 안내, 모아보기 PiP가 열릴 때 채팅 복원, 치지직 채팅 크기 버튼 숨김과 채팅 팝업 창 글자 크기 도구 동기화, 채팅 팝업 창의 확장 팝업 응답·설정 유지, 채팅 팝업 창에서 content.js 미동작(페이지 글자 크기 도구가 붙지 않음)과 모아보기 상태 응답, 페이지·PiP·채팅 팝업 창 글자 크기 도구의 공용 스타일을 검사합니다.
- `header-regressions.js`: 배너·순위 개별 숨김, 공간 복원·공지·입력 유지, 저장·native iframe 연동과 채팅 안 글자 크기 제어를 검사합니다.
- `watch-regressions.js`: 시작 전 채팅 제외, 닉네임 필터, DOM 재렌더링·역순 배치·동일 발언 구분, 1,000건 한도, 별도 창 재사용·글꼴·자동 스크롤·원본 탭 종료, 모아보기 PiP 이동·갱신·복원과 다른 PiP에 의한 종료를 검사합니다.
- 결과 객체의 `pass`가 `true`이고 모든 `results[].pass`가 `true`여야 통과입니다.
  CLI 명령의 종료 코드만으로 테스트 통과를 판단하지 않습니다.

확장 파일을 수정했다면 세션을 닫았다가 다시 열어 변경된 확장을 로드해야 합니다.
`run.sh`는 스위트마다 새 세션을 열고 닫으므로 매번 현재 파일이 로드됩니다.
PiP·전체화면·창 크기·탭 종료 검사가 브라우저 상태를 바꾸므로, 여러 스위트를 연속 실행해 실패했다면
`sh tests/run.sh <스위트>` 단독 실행으로 상태 간섭과 제품 결함을 구분합니다. `watch-regressions.js`는 원본 탭 종료도 검사합니다.

## 실사이트 확인

회귀 스위트는 사이트의 특정 DOM 조건을 재현한 fixture 페이지를 사용합니다.
실제 사이트의 DOM 변경 여부는 회귀 스위트로 확인되지 않으므로 수동 스크립트로 별도 확인합니다.

- 실행은 계속 headless입니다.
- 유튜브는 `HeadlessChrome` User-Agent를 차단하므로, 페이지에 CDP
  `Network.setUserAgentOverride`를 걸어 UA의 `HeadlessChrome`을 `Chrome`으로 바꾼 뒤 확인합니다.
- 로그인과 채팅 전송은 하지 않습니다. 공개 방송 페이지를 열어 탐지·표시만 확인합니다.
