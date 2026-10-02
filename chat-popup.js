(() => {
  // 치지직 채팅 팝업 창·유튜브 채팅 팝아웃 창(최상위 독립 채팅 페이지) 전용.
  // content.js가 동작하지 않는 이 창에서 글자 크기 도구와 확장 팝업의 상태 조회·설정 변경을 맡는다.
  const IS_CHZZK = location.hostname === 'chzzk.naver.com' && /^\/live\/[^/]+\/chat\/?$/.test(location.pathname);
  const IS_YT = location.hostname === 'www.youtube.com' && /^\/live_chat(?:_replay)?$/.test(location.pathname);
  if (!IS_CHZZK && !IS_YT) return;

  const STORAGE_KEY = IS_YT ? 'chatDungsil:youtube' : 'chatDungsil:chzzk';
  const ROOT_SELECTOR = IS_YT ? 'yt-live-chat-renderer #chat-messages' : 'aside:has(> [role="log"])';
  const VERSION = chrome.runtime.getManifest().version;
  // chat-font.js가 먼저 주입되어 글자 크기 검사·도구 API를 제공한다.
  const FONT = globalThis.chatDungsilFont;
  let saved = {};
  let toolbar = null;

  function fontSize() {
    return FONT.normalize(saved.fontSize);
  }

  function status() {
    return {
      version: VERSION,
      popupChat: true,
      site: IS_YT ? 'youtube' : 'chzzk',
      supportsChatAppearance: IS_CHZZK,
      fontSize: fontSize(),
      hideChatBanner: saved.hideChatBanner === true,
      hideChatRanking: saved.hideChatRanking === true,
    };
  }

  // 방송 탭 content.js와 같은 저장 객체를 쓰므로 바꾼 항목만 합쳐 저장한다.
  async function save(patch) {
    saved = { ...(await chrome.storage.local.get([STORAGE_KEY]))[STORAGE_KEY], ...patch };
    await chrome.storage.local.set({ [STORAGE_KEY]: saved });
    syncToolbar();
  }

  function syncToolbar() {
    if (toolbar) FONT.renderToolbar(toolbar, fontSize());
  }

  function mountToolbar() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root || toolbar?.parentElement === root) return;
    toolbar?.remove();
    toolbar = FONT.createToolbar(document, 'chat-dungsil-popup-font',
      action => save({ fontSize: FONT.nextSize(fontSize(), action) }));
    root.prepend(toolbar);
    syncToolbar();
  }

  (async () => {
    saved = (await chrome.storage.local.get([STORAGE_KEY]))[STORAGE_KEY] || {};
    syncToolbar();
  })();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    saved = changes[STORAGE_KEY].newValue || {};
    syncToolbar();
  });
  mountToolbar();
  setInterval(mountToolbar, 500);

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.type === 'getStatus') {
      respond(status());
    } else if (msg?.type === 'setFontSize') {
      const value = msg.value;
      if (value !== null && FONT.normalize(value) === null) respond(status());
      else (async () => { await save({ fontSize: value }); respond(status()); })();
      return true;
    } else if (IS_CHZZK && (msg?.type === 'setChatBannerHidden' || msg?.type === 'setChatRankingHidden')) {
      const key = msg.type === 'setChatBannerHidden' ? 'hideChatBanner' : 'hideChatRanking';
      (async () => { await save({ [key]: msg.value === true }); respond(status()); })();
      return true;
    }
  });
})();
