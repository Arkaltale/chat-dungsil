(() => {
  if (globalThis.chatDungsilFont) return;

  const MIN = 12;
  const MAX = 24;
  const DEFAULT_STEP_BASE = 16;
  const isChzzk = location.hostname === 'chzzk.naver.com';
  const STYLE_ID = 'chat-dungsil-font';
  const TOOLBAR_STYLE_ID = 'chat-dungsil-font-toolbar-style';
  const SELECTORS = isChzzk
    ? ['[role="log"] [class*="_chatting_message_"] span[class*="_text_"]']
    : ['yt-live-chat-text-message-renderer #author-name', 'yt-live-chat-text-message-renderer #message'];
  // 방송 페이지·확장 PiP 창·채팅 팝업 창의 글자 크기 도구가 함께 쓰는 스타일.
  const TOOLBAR_CSS = '.chat-dungsil-font-toolbar{box-sizing:border-box;display:flex;flex:none;width:100%;height:28px;' +
    'align-items:center;justify-content:center;gap:4px;background:#202226;color:#fff;' +
    'font:12px -apple-system,"Malgun Gothic",sans-serif;user-select:none}' +
    '.chat-dungsil-font-toolbar button{min-width:24px;height:22px;border:0;border-radius:3px;' +
    'background:#393c42;color:#fff;cursor:pointer}' +
    '.chat-dungsil-font-toolbar button:disabled{opacity:.4;cursor:default}';

  // 12~24 정수만 유효한 글자 크기로 보고, 그 밖의 값은 사이트 기본값(null)으로 취급한다.
  function normalize(value) {
    return Number.isInteger(value) && value >= MIN && value <= MAX ? value : null;
  }

  // 도구 버튼 동작(decrease/increase/reset)을 적용한 다음 글자 크기.
  function nextSize(current, action) {
    if (action === 'reset') return null;
    const delta = action === 'increase' ? 1 : -1;
    return Math.max(MIN, Math.min(MAX, (normalize(current) ?? DEFAULT_STEP_BASE) + delta));
  }

  function apply(doc, value) {
    let style = doc.getElementById(STYLE_ID);
    if (normalize(value) === null) {
      style?.remove();
      return;
    }
    if (!style) {
      style = doc.createElement('style');
      style.id = STYLE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = SELECTORS.join(',\n') + ' { font-size: ' + value + 'px !important; }';
  }

  function ensureToolbarStyle(doc) {
    if (doc.getElementById(TOOLBAR_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = TOOLBAR_STYLE_ID;
    style.textContent = TOOLBAR_CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // onAction(action)은 decrease/increase/reset 버튼 클릭 때 호출된다.
  function createToolbar(doc, idPrefix, onAction) {
    ensureToolbarStyle(doc);
    const toolbar = doc.createElement('div');
    toolbar.id = idPrefix + '-toolbar';
    toolbar.className = 'chat-dungsil-font-toolbar';
    toolbar.setAttribute('aria-label', '채팅 글자 크기');
    toolbar.innerHTML = '<span>글자</span>' +
      '<button type="button" data-action="decrease" aria-label="글자 크기 줄이기">−</button>' +
      '<span data-action="value" aria-live="polite"></span>' +
      '<button type="button" data-action="increase" aria-label="글자 크기 키우기">+</button>' +
      '<button type="button" data-action="reset" aria-label="글자 크기 기본값">기본</button>';
    for (const action of ['decrease', 'value', 'increase', 'reset']) {
      toolbar.querySelector('[data-action="' + action + '"]').id = idPrefix + '-' + action;
    }
    toolbar.addEventListener('mousedown', event => event.stopPropagation());
    toolbar.addEventListener('click', event => {
      const action = event.target.closest('button')?.dataset.action;
      if (!action) return;
      event.stopPropagation();
      onAction(action);
    });
    return toolbar;
  }

  function renderToolbar(toolbar, value) {
    const size = normalize(value);
    toolbar.querySelector('[data-action="value"]').textContent = size == null ? '기본값' : size + 'px';
    toolbar.querySelector('[data-action="decrease"]').disabled = size === MIN;
    toolbar.querySelector('[data-action="increase"]').disabled = size === MAX;
    toolbar.querySelector('[data-action="reset"]').disabled = size == null;
  }

  globalThis.chatDungsilFont = { MIN, MAX, normalize, nextSize, apply, createToolbar, renderToolbar };

  // 자동 적용: 치지직(최상위·채팅 팝업 iframe)과 유튜브 채팅 iframe·팝아웃 창에서만.
  const isYoutubeChat = location.hostname === 'www.youtube.com' &&
    (location.pathname === '/live_chat' || location.pathname === '/live_chat_replay');
  if (!isChzzk && !isYoutubeChat) return;
  if (isChzzk && window !== window.top && !/^\/live\/[^/]+\/chat\/?$/.test(location.pathname)) return;

  const STORAGE_KEY = isChzzk ? 'chatDungsil:chzzk' : 'chatDungsil:youtube';
  chrome.storage.local.get([STORAGE_KEY], res => apply(document, res[STORAGE_KEY]?.fontSize));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      apply(document, changes[STORAGE_KEY].newValue?.fontSize);
    }
  });
})();
