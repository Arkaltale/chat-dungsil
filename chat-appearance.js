(() => {
  if (location.hostname !== 'chzzk.naver.com') return;
  if (window !== window.top && !/^\/live\/[^/]+\/chat\/?$/.test(location.pathname)) return;
  if (globalThis.chatDungsilAppearance) return;

  const STORAGE_KEY = 'chatDungsil:chzzk';
  const STYLE_ID = 'chat-dungsil-appearance';
  const ROOT = ':is(#aside-chatting, aside:has(> [role="log"]))';
  // 확장 PiP iframe과 치지직 자체 채팅 팝업 창에서는 확장 글자 크기 도구와 겹치는 치지직 채팅 크기 버튼을 숨긴다.
  const HIDE_NATIVE_SCALE = window.name === 'chat-dungsil-pip' ||
    (window === window.top && /^\/live\/[^/]+\/chat\/?$/.test(location.pathname));

  function apply(doc, hideChatBanner, hideChatRanking) {
    let style = doc.getElementById(STYLE_ID);
    const selectors = [];
    if (hideChatBanner) selectors.push(ROOT + ' > [class*="_banner_"]');
    if (hideChatRanking) selectors.push(ROOT + ' > div:has(> button[class*="_ranking_button_"])');
    if (HIDE_NATIVE_SCALE) selectors.push('div[class*="_scale_"]:has(> button[class*="_scale_button_"])');
    if (!selectors.length) {
      style?.remove();
      return;
    }
    if (!style) {
      style = doc.createElement('style');
      style.id = STYLE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = selectors.join(',\n') + ' { display: none !important; }';
  }

  globalThis.chatDungsilAppearance = { apply };
  chrome.storage.local.get([STORAGE_KEY], res => {
    const saved = res[STORAGE_KEY] || {};
    apply(document, saved.hideChatBanner === true, saved.hideChatRanking === true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const saved = changes[STORAGE_KEY].newValue || {};
    apply(document, saved.hideChatBanner === true, saved.hideChatRanking === true);
  });
})();
