const statusEl = document.getElementById('status');
const versionEl = document.getElementById('version');
const toggleBtn = document.getElementById('toggle');
const resetBtn = document.getElementById('reset');
const hideBtn = document.getElementById('hide');
const lockedInput = document.getElementById('locked');
const theaterInput = document.getElementById('autoTheater');
const opacityInput = document.getElementById('opacity');
const opacityValue = document.getElementById('opv');
const fontSizeInput = document.getElementById('fontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
const fontSizeResetBtn = document.getElementById('fontSizeReset');
const chatAppearance = document.getElementById('chatAppearance');
const hideChatBannerInput = document.getElementById('hideChatBanner');
const hideChatRankingInput = document.getElementById('hideChatRanking');
const pipInput = document.getElementById('pip');
const floatingControls = document.getElementById('floatingControls');
const keysEl = document.getElementById('keys');
const pipStatusEl = document.getElementById('pipStatus');
const watchSection = document.getElementById('watchSection');
const watchTargetsInput = document.getElementById('watchTargets');
const watchSaveBtn = document.getElementById('watchSave');
const watchToggleBtn = document.getElementById('watchToggle');
const watchOpenBtn = document.getElementById('watchOpen');
const watchStatusEl = document.getElementById('watchStatus');
const installedVersion = chrome.runtime.getManifest().version;
let hidden = false;
let targetTabId = null;
let lastStatus = null;
let watchState = null;
let watchTargetsDirty = false;

function send(msg) {
  return new Promise((resolve) => {
    const deliver = (tabId) => {
      if (tabId == null) return resolve(null);
      chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }, (res) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res || null);
      });
    };
    if (targetTabId != null) return deliver(targetTabId);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      targetTabId = tabs[0]?.id ?? null;
      deliver(targetTabId);
    });
  });
}

function render(st) {
  lastStatus = st;
  const ok = st !== null && st.version === installedVersion;
  // 치지직 채팅 팝업·유튜브 채팅 팝아웃 창은 그 자체가 분리된 채팅이라 플로팅·PiP 관련 제어를 숨긴다.
  const popupChat = ok && st.popupChat === true;
  floatingControls.hidden = popupChat;
  keysEl.hidden = popupChat;
  versionEl.textContent = '설치 ' + installedVersion + ' · 페이지 ' + (st?.version || '확인 안 됨');
  const pipBusy = !!(st?.pip || st?.pipPending);
  toggleBtn.disabled = !ok || pipBusy;
  resetBtn.disabled = !ok || !st.floating || pipBusy;
  hideBtn.disabled = !ok || !st.floating || pipBusy;
  lockedInput.disabled = !ok || pipBusy;
  theaterInput.disabled = !ok;
  opacityInput.disabled = !ok;
  fontSizeInput.disabled = !ok;
  fontSizeResetBtn.disabled = !ok || st.fontSize == null;
  chatAppearance.hidden = !ok || !st.supportsChatAppearance;
  hideChatBannerInput.disabled = !ok || !st.supportsChatAppearance;
  hideChatRankingInput.disabled = !ok || !st.supportsChatAppearance;
  hideChatBannerInput.checked = !!st?.hideChatBanner;
  hideChatRankingInput.checked = !!st?.hideChatRanking;
  pipInput.checked = !!st?.pip;
  pipInput.disabled = !ok || !st.pipSupported || !!st.pipPending || (!st.chatFound && !st.pip);
  pipStatusEl.textContent = !ok ? '' : st.pipPending ? 'PiP 창을 여는 중…' :
    st.pipError || (!st.pipSupported ? '이 브라우저는 외부 PiP 창을 지원하지 않습니다.' :
      !st.chatFound && !st.pip ? '채팅창이 나타나면 외부 PiP를 사용할 수 있습니다.' : '');
  if (!ok) {
    statusEl.textContent = st
      ? '페이지에 이전 코드가 적용되어 있습니다. 페이지를 새로고침하세요.'
      : '치지직·유튜브 페이지에서 사용하세요. 해당 페이지라면 새로고침이 필요합니다.';
    return;
  }
  const mode = { normal: '일반', theater: 'T 모드', fs: '전체화면' }[st.mode] || '일반';
  statusEl.textContent = popupChat ? (st.site === 'youtube'
    ? '유튜브 채팅 팝아웃 창 · 글자 크기를 설정할 수 있습니다.'
    : '치지직 채팅 팝업 창 · 글자 크기와 채팅 상단 표시를 설정할 수 있습니다.')
    : mode + ' · ' + (st.pip ? '외부 PiP 표시 중' : st.floating
      ? (st.hidden ? '채팅 숨김' : '플로팅 중')
      : (st.chatFound ? '원래 자리' : '채팅창을 기다리는 중'));
  toggleBtn.textContent = st.floating ? '채팅을 원래 자리로' : '채팅 분리하기';
  hidden = !!st.hidden;
  hideBtn.textContent = hidden ? '채팅 다시 표시' : '채팅 잠시 숨기기';
  lockedInput.checked = !!st.locked;
  theaterInput.checked = !!st.autoTheater;
  if (typeof st.opacity === 'number') {
    const pct = Math.round(st.opacity * 100);
    opacityInput.value = String(pct);
    opacityValue.textContent = pct + '%';
  }
  if (Number.isInteger(st.fontSize) && st.fontSize >= 12 && st.fontSize <= 24) {
    fontSizeInput.value = String(st.fontSize);
    fontSizeValue.textContent = st.fontSize + 'px';
  } else {
    fontSizeInput.value = '16';
    fontSizeValue.textContent = '사이트 기본값';
  }
}

async function refresh() {
  render(await send({ type: 'getStatus' }));
}

async function update(msg) {
  await send(msg);
  await refresh();
}

toggleBtn.addEventListener('click', () => update({ type: 'toggleFloat' }));
resetBtn.addEventListener('click', () => update({ type: 'reset' }));
hideBtn.addEventListener('click', () => update({ type: 'setHidden', value: !hidden }));
lockedInput.addEventListener('change', () => update({ type: 'setLocked', value: lockedInput.checked }));
theaterInput.addEventListener('change', () => update({ type: 'setAutoTheater', value: theaterInput.checked }));
opacityInput.addEventListener('input', () => {
  opacityValue.textContent = opacityInput.value + '%';
  send({ type: 'setOpacity', value: Number(opacityInput.value) / 100 });
});
fontSizeInput.addEventListener('input', () => {
  fontSizeValue.textContent = fontSizeInput.value + 'px';
  fontSizeResetBtn.disabled = false;
  send({ type: 'setFontSize', value: Number(fontSizeInput.value) });
});
fontSizeResetBtn.addEventListener('click', () => update({ type: 'setFontSize', value: null }));
hideChatBannerInput.addEventListener('change', () => update({ type: 'setChatBannerHidden', value: hideChatBannerInput.checked }));
hideChatRankingInput.addEventListener('change', () => update({ type: 'setChatRankingHidden', value: hideChatRankingInput.checked }));
pipInput.addEventListener('change', async () => {
  const value = pipInput.checked;
  render({ ...lastStatus, pipPending: true });
  const response = await send({ type: 'setPip', value });
  render(response);
  await refresh();
});

function renderWatch(state) {
  watchSection.hidden = !state;
  watchState = state;
  if (!state) return;
  if (!watchTargetsDirty && document.activeElement !== watchTargetsInput) {
    watchTargetsInput.value = state.targets.join('\n');
  }
  watchToggleBtn.disabled = !state.enabled && !state.targets.length;
  watchToggleBtn.textContent = state.enabled ? '수집 중지' : '수집 시작';
  watchStatusEl.textContent = (state.enabled ? '수집 중 · ' : '중지 · ') +
    state.count + '/1,000건' + (!state.available ? ' · 채팅창을 기다리는 중' : '') +
    (state.stoppedReason ? ' · ' + state.stoppedReason : '');
}

async function refreshWatch() {
  renderWatch(await send({ type: 'getWatchState' }));
}

watchTargetsInput.addEventListener('input', () => { watchTargetsDirty = true; });
watchSaveBtn.addEventListener('click', async () => {
  const result = await send({ type: 'setWatchTargets', targets: watchTargetsInput.value });
  if (!result) return;
  watchTargetsDirty = false;
  watchTargetsInput.value = result.targets.join('\n');
  renderWatch(result);
});
watchToggleBtn.addEventListener('click', async () => {
  renderWatch(await send({ type: 'setWatchEnabled', value: !watchState?.enabled }));
});
watchOpenBtn.addEventListener('click', async () => {
  if (targetTabId == null || !watchState) return;
  const url = chrome.runtime.getURL('watch.html?tabId=' + targetTabId);
  const windows = await chrome.windows.getAll({ populate: true });
  const existing = windows.find(win => win.tabs?.some(tab => tab.url === url));
  if (existing) await chrome.windows.update(existing.id, { focused: true });
  else await chrome.windows.create({ url, type: 'popup', width: 440, height: 680 });
});

refresh();
setInterval(refresh, 500);
refreshWatch();
setInterval(refreshWatch, 1000);
