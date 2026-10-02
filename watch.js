const sourceTabId = Number(new URLSearchParams(location.search).get('tabId'));
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const autoScrollInput = document.getElementById('autoScroll');
const clearButton = document.getElementById('clear');
const pipButton = document.getElementById('pip');
const pipNotice = document.getElementById('pipNotice');
const headerEl = document.querySelector('header');
let pipWindow = null;
let revision = null;
let refreshing = false;

async function send(message) {
  if (!Number.isInteger(sourceTabId) || sourceTabId < 0) return null;
  try {
    return await chrome.tabs.sendMessage(sourceTabId, message, { frameId: 0 });
  } catch {
    return null;
  }
}

function renderMessages(messages) {
  const fragment = document.createDocumentFragment();
  for (const message of messages) {
    const row = document.createElement('div');
    row.className = 'message';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const time = document.createElement('time');
    time.dateTime = new Date(message.at).toISOString();
    time.textContent = new Date(message.at).toLocaleTimeString('ko-KR');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = message.nickname;
    meta.append(time, ' · ', name);
    const body = document.createElement('div');
    body.className = 'text';
    body.textContent = message.text;
    row.append(meta, body);
    fragment.append(row);
  }
  messagesEl.replaceChildren(fragment);
  scrollToLatest();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const result = await send({ type: 'getWatchMessages', sinceRevision: revision });
  refreshing = false;
  if (!result) {
    revision = null;
    messagesEl.replaceChildren();
    statusEl.textContent = '원본 탭이 닫혔거나 응답하지 않습니다. 이 창을 닫아 주세요.';
    return;
  }
  statusEl.textContent = (result.enabled ? '수집 중' : '수집 중지') + ' · ' +
    result.count + '/1,000건' + (result.stoppedReason ? ' · ' + result.stoppedReason : '');
  if (result.unchanged) return;
  revision = result.revision;
  renderMessages(result.messages || []);
}

function applyFont(saved) {
  const value = globalThis.chatDungsilFont.normalize(saved?.fontSize);
  messagesEl.style.fontSize = value == null ? '' : value + 'px';
}

(async () => applyFont((await chrome.storage.local.get('chatDungsil:chzzk'))['chatDungsil:chzzk']))();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['chatDungsil:chzzk']) applyFont(changes['chatDungsil:chzzk'].newValue);
});
function scrollToLatest() {
  if (autoScrollInput.checked) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 목록과 컨트롤 DOM을 PiP 문서로 옮긴다. 폴링·이벤트 처리는 이 창의 스크립트가 계속 맡는다.
async function openPip() {
  let win;
  try {
    win = await documentPictureInPicture.requestWindow({ width: 360, height: 520 });
  } catch (error) {
    pipNotice.hidden = false;
    pipNotice.textContent = 'PiP 창을 열지 못했습니다: ' + error.message;
    return;
  }
  const style = win.document.createElement('style');
  style.textContent = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText)).join('\n');
  win.document.head.append(style);
  win.document.title = document.title;
  win.document.body.append(headerEl, messagesEl);
  pipWindow = win;
  pipButton.textContent = '창으로 되돌리기';
  pipNotice.hidden = false;
  pipNotice.textContent = '모아보기를 항상 위 PiP 창에 표시하고 있습니다. 이 창을 닫으면 PiP 창도 닫힙니다.';
  scrollToLatest();
  win.addEventListener('pagehide', () => {
    if (pipWindow !== win) return;
    pipWindow = null;
    document.body.insertBefore(messagesEl, pipNotice);
    document.body.insertBefore(headerEl, messagesEl);
    pipButton.textContent = '항상 위(PiP)';
    pipNotice.hidden = true;
    scrollToLatest();
  }, { once: true });
}

pipButton.hidden = !window.documentPictureInPicture?.requestWindow;
pipButton.addEventListener('click', () => {
  if (pipWindow) pipWindow.close();
  else openPip();
});
clearButton.addEventListener('click', async () => {
  if (await send({ type: 'clearWatch' })) await refresh();
});
chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId !== sourceTabId) return;
  revision = null;
  messagesEl.replaceChildren();
  statusEl.textContent = '원본 탭이 닫혔습니다. 이 창을 닫아 주세요.';
});
refresh();
setInterval(refresh, 800);
