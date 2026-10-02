(() => {
  const IS_YT = location.hostname.endsWith('youtube.com');
  // 사이트 자체 채팅 팝업(팝아웃) 창은 그 자체가 분리된 채팅이라 chat-popup.js가 맡는다.
  if (!IS_YT && /^\/live\/[^/]+\/chat\/?$/.test(location.pathname)) return;
  if (IS_YT && /^\/live_chat(?:_replay)?$/.test(location.pathname)) return;
  // 사이트별로 위치/크기/투명도 등 설정을 따로 저장한다.
  const STORAGE_KEY = IS_YT ? 'chatDungsil:youtube' : 'chatDungsil:chzzk';
  const INJECTED_VERSION = chrome.runtime.getManifest().version;
  // chat-font.js가 먼저 주입되어 글자 크기 검사·도구 API를 제공한다.
  const FONT = globalThis.chatDungsilFont;

  // 치지직·유튜브 채팅창 후보 selector. 치지직은 CSS module 해시 앞 접두어만 부분일치로 찾는다.
  // 사이트 개편으로 빗나가면 Alt(Option)+Shift+P 수동 지정을 사용한다.
  const CHAT_SELECTORS = [
    '#aside-chatting',
    'ytd-live-chat-frame',
    '[class*="live_chatting_area_wrapper"]',
    '[class*="chatting_area_wrapper"]',
    '[class*="chatting_list_wrapper"]',
    '[class*="live_chatting_wrapper"]',
    '[class*="ChattingArea"]',
    '[class*="chat_wrapper"]',
    '[class*="chatting_area"]',
  ];

  const MIN_W = 200;
  const MIN_H = 150;
  const HANDLE_H = 26;
  const DEFAULTS = {
    fs: { left: null, top: null, width: 360, height: 520 },
    normal: { left: null, top: null, width: 360, height: 520 },
  };

  let state = null;
  let chatEl = null;
  let savedStyle = '';
  let placeholder = null;
  let handle = null;
  let grip = null;
  let floating = false;
  let pickMode = false;
  let lastHover = null;
  let dragging = null;
  let resizing = null;
  let hideTimer = null;
  let posOffset = { x: 0, y: 0 };
  let autoFloated = false;
  let autoFloatTimer = null;
  let fsOptOut = false;
  let theaterOptOut = false;
  let locked = false;
  let hidden = false;
  let lastMode = 'normal';
  let transientPosition = {};
  let chatClassObserver = null;
  let pipWindow = null;
  let pipPending = false;
  let pipError = '';
  let pipRequestId = 0;
  let pipSnapshot = null;
  let pipSource = null;
  let pipSourceVisibility = null;
  let pipFallbackButton = null;
  let pageFontToolbar = null;

  function normalize(saved) {
    return {
      fs: Object.assign({}, DEFAULTS.fs, saved.fs),
      normal: Object.assign({}, DEFAULTS.normal, saved.normal),
      theater: Object.assign({}, DEFAULTS.normal, saved.theater || saved.normal),
      opacity: typeof saved.opacity === 'number' ? saved.opacity : 1,
      fontSize: FONT.normalize(saved.fontSize),
      hideChatBanner: saved.hideChatBanner === true,
      hideChatRanking: saved.hideChatRanking === true,
      autoTheater: saved.autoTheater === true,
      locked: saved.locked === true,
    };
  }

  async function loadState() {
    const res = await chrome.storage.local.get([STORAGE_KEY]);
    state = normalize(res[STORAGE_KEY] || {});
    locked = state.locked;
    lastMode = currentMode();
    if (!IS_YT) FONT.apply(document, state.fontSize);
    if (!IS_YT) globalThis.chatDungsilAppearance?.apply(document, state.hideChatBanner, state.hideChatRanking);
  }

  function saveState() {
    chrome.storage.local.set({ [STORAGE_KEY]: state });
  }

  function overlayHost() {
    // 진짜 전체화면에서는 전체화면 요소 밖 DOM이 렌더링되지 않는다.
    return document.fullscreenElement || document.body;
  }

  function toast(msg, ms = 2500) {
    let t = document.getElementById('chat-dungsil-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'chat-dungsil-toast';
    }
    const host = overlayHost();
    if (t.parentElement !== host) host.appendChild(t);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function currentMode() {
    if (document.fullscreenElement) return 'fs';
    if (IS_YT && document.querySelector('ytd-watch-flexy[theater]')) return 'theater';
    if (!IS_YT && (document.querySelector('#live_player_layout.is_large') ||
      document.querySelector('.pzp-viewmode-button[aria-label="좁은 화면"]'))) return 'theater';
    return 'normal';
  }

  function hasChatContent(el) {
    // 유튜브 채팅은 iframe이라 부모 DOM에 텍스트가 없다
    if (el.tagName === 'IFRAME') return true;
    if (el.querySelector('iframe')) return true;
    // 확장이 넣은 UI(글자 크기 도구 등)의 문구는 채팅 내용으로 보지 않는다.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.data.trim()) continue;
      if (!node.parentElement?.closest('.chat-dungsil-font-toolbar, [id^="chat-dungsil"]')) return true;
    }
    return false;
  }

  function findChatContainer() {
    for (const sel of CHAT_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (el === chatEl) continue;
        if (el.id === 'aside-chatting' && document.fullscreenElement && hasChatContent(el)) return el;
        if (el.tagName === 'YTD-LIVE-CHAT-FRAME' && el.querySelector('iframe')) return el;
        // 유튜브 라이브챗 iframe을 품은 컨테이너는 확실한 채팅창이므로,
        // 전체화면에서 조상이 숨겨져 크기가 0이어도 인정한다.
        if (el.querySelector('iframe[src*="live_chat"]')) return el;
        // 내용이 빈 채팅 껍데기 컨테이너(검은 박스)를 잡지 않도록 내용 존재를 요구
        if (!hasChatContent(el)) continue;
        if (el.offsetWidth >= 150 && el.offsetWidth <= 700 && el.offsetHeight >= 200) {
          return el;
        }
      }
    }
    return null;
  }

  function setImportant(el, prop, value) {
    el.style.setProperty(prop, value, 'important');
  }

  function setPos(left, top) {
    setImportant(chatEl, 'left', left - posOffset.x + 'px');
    setImportant(chatEl, 'top', top - posOffset.y + 'px');
  }

  // position:fixed는 조상에 transform/filter 등이 있으면 뷰포트가 아니라 그 조상
  // 기준으로 좌표가 잡힌다. 원하는 뷰포트 좌표와 실제 렌더 위치의 차이를 측정해
  // 오프셋으로 보정한다.
  function calibratePos(left, top) {
    if (!chatEl) return;
    const r = chatEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dx = r.left - left;
    const dy = r.top - top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      posOffset.x += dx;
      posOffset.y += dy;
      setPos(left, top);
    }
  }

  function applyMode(mode) {
    if (!chatEl) return;
    const s = state[mode];
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const w = Math.min(Math.max(MIN_W, s.width), vw);
    const h = Math.min(Math.max(MIN_H, s.height), vh);
    const temporary = transientPosition[mode];
    if (temporary && vw >= s.width && vh >= s.height) delete transientPosition[mode];
    const position = transientPosition[mode] || s;
    let left = position.left != null ? position.left : vw - w - 24;
    let top = position.top != null ? position.top : vh - h - 24;
    left = Math.max(0, Math.min(left, vw - w));
    top = Math.max(0, Math.min(top, vh - h));
    setImportant(chatEl, 'width', w + 'px');
    setImportant(chatEl, 'height', h + 'px');
    setImportant(chatEl, 'right', 'auto');
    setImportant(chatEl, 'bottom', 'auto');
    setImportant(chatEl, 'margin', '0');
    setImportant(chatEl, 'transform', 'none');
    // 사이트 열림 애니메이션의 초기 상태(투명/숨김)가 남아 있으면 검게 보인다.
    // 사용자 설정 투명도(기본 100%)로 강제한다.
    setImportant(chatEl, 'opacity', String(state.opacity));
    setImportant(chatEl, 'visibility', pipWindow ? 'hidden' : (hidden ? 'hidden' : 'visible'));
    setPos(left, top);
    calibratePos(left, top);
  }

  function ensureUI() {
    if (!handle) {
      handle = document.createElement('div');
      handle.id = 'chat-dungsil-handle';
      handle.innerHTML =
        '<span>⠿ 채팅창 이동</span>' +
        '<span class="chat-dungsil-btns">' +
        '<button type="button" data-action="reset" title="위치/크기 초기화">⟲</button>' +
        '<button type="button" data-action="close" title="플로팅 해제">✕</button>' +
        '</span>';
      handle.addEventListener('mousedown', onDragStart);
      handle.addEventListener('mouseenter', showUI);
      handle.addEventListener('mouseleave', scheduleHide);
      handle.querySelector('[data-action="reset"]').addEventListener('click', (e) => {
        e.stopPropagation();
        resetCurrentMode();
      });
      handle.querySelector('[data-action="close"]').addEventListener('click', (e) => {
        e.stopPropagation();
        optOutCurrentMode();
        unfloat();
        toast('플로팅을 해제했습니다. 다시 켜려면 Alt(Option)+Shift+C.');
      });

      grip = document.createElement('div');
      grip.id = 'chat-dungsil-grip';
      grip.addEventListener('mousedown', onResizeStart);
      grip.addEventListener('mouseenter', showUI);
      grip.addEventListener('mouseleave', scheduleHide);
    }
    const host = overlayHost();
    if (handle.parentElement !== host) host.appendChild(handle);
    if (grip.parentElement !== host) host.appendChild(grip);
  }

  function syncUI() {
    if (!floating || !chatEl || !handle) return;
    const r = chatEl.getBoundingClientRect();
    const hTop = r.top >= HANDLE_H + 2 ? r.top - HANDLE_H : r.top;
    handle.style.left = r.left + 'px';
    handle.style.top = hTop + 'px';
    handle.style.width = r.width + 'px';
    grip.style.left = r.right - 18 + 'px';
    grip.style.top = r.bottom - 18 + 'px';
    handle.classList.toggle('locked', locked);
    grip.classList.toggle('locked', locked);
  }

  function showUI() {
    clearTimeout(hideTimer);
    if (!floating || !handle || hidden || pipWindow) return;
    syncUI();
    handle.classList.add('visible');
    grip.classList.add('visible');
    if (chatEl) setImportant(chatEl, 'opacity', '1');
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (dragging || resizing) return;
      if (chatEl?.matches(':hover') || handle?.matches(':hover') || grip?.matches(':hover')) {
        showUI();
        return;
      }
      if (handle) handle.classList.remove('visible');
      if (grip) grip.classList.remove('visible');
      if (floating && chatEl) setImportant(chatEl, 'opacity', String(state.opacity));
    }, 400);
  }

  function applyFloat(el) {
    if (floating) unfloat();
    chatEl = el;
    savedStyle = el.getAttribute('style') || '';
    el.classList.add('chat-dungsil-float');
    floating = true;
    chatClassObserver = new MutationObserver(() => {
      if (!floating || chatEl !== el || !el.isConnected || el.classList.contains('chat-dungsil-float')) return;
      el.classList.add('chat-dungsil-float');
      posOffset = { x: 0, y: 0 };
      applyMode(currentMode());
      syncUI();
    });
    chatClassObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
    posOffset = { x: 0, y: 0 };
    ensureUI();
    el.addEventListener('mouseenter', showUI);
    el.addEventListener('mouseleave', scheduleHide);
    applyMode(currentMode());
    syncUI();
    showUI();
    scheduleHide();
    // 채팅 영역이 비워진 것을 사이트 플레이어가 다시 계산하도록 유도한다.
    window.dispatchEvent(new Event('resize'));
  }

  function cancelInteraction() {
    clearTimeout(hideTimer);
    hideTimer = null;
    dragging = null;
    resizing = null;
    document.documentElement.classList.remove('chat-dungsil-interacting');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
  }

  function unfloat() {
    cancelInteraction();
    hidden = false;
    if (chatClassObserver) chatClassObserver.disconnect();
    chatClassObserver = null;
    if (!chatEl) {
      floating = false;
      return;
    }
    if (placeholder) {
      if (placeholder.parentNode) placeholder.parentNode.insertBefore(chatEl, placeholder);
      placeholder.remove();
      placeholder = null;
    }
    chatEl.classList.remove('chat-dungsil-float');
    if (savedStyle) chatEl.setAttribute('style', savedStyle);
    else chatEl.removeAttribute('style');
    chatEl.removeEventListener('mouseenter', showUI);
    chatEl.removeEventListener('mouseleave', scheduleHide);
    if (handle) handle.classList.remove('visible');
    if (grip) grip.classList.remove('visible');
    chatEl = null;
    floating = false;
    updateYtFsStyle();
    window.dispatchEvent(new Event('resize'));
  }

  function persist(resized = false) {
    if (!chatEl) return;
    const r = chatEl.getBoundingClientRect();
    const mode = currentMode();
    const prior = state[mode];
    const constrained = prior.width > window.innerWidth || prior.height > window.innerHeight;
    if (constrained && !resized) {
      transientPosition[mode] = { left: Math.round(r.left), top: Math.round(r.top) };
      return;
    }
    state[mode] = {
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
    saveState();
  }

  function resetCurrentMode() {
    const mode = currentMode();
    state[mode] = Object.assign({}, DEFAULTS[mode] || DEFAULTS.normal);
    delete transientPosition[mode];
    saveState();
    applyMode(mode);
    syncUI();
    toast('현재 화면 모드의 채팅창 위치/크기를 초기화했습니다.');
  }

  function onDragStart(e) {
    if (locked || hidden || e.target.closest('button')) return;
    e.preventDefault();
    const r = chatEl.getBoundingClientRect();
    dragging = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    document.documentElement.classList.add('chat-dungsil-interacting');
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e) {
    if (!dragging) return;
    const r = chatEl.getBoundingClientRect();
    const left = Math.max(0, Math.min(dragging.left + e.clientX - dragging.x, Math.max(0, window.innerWidth - r.width)));
    const top = Math.max(0, Math.min(dragging.top + e.clientY - dragging.y, Math.max(0, window.innerHeight - r.height)));
    setPos(left, top);
    syncUI();
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = null;
    document.documentElement.classList.remove('chat-dungsil-interacting');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    persist();
    scheduleHide();
  }

  function onResizeStart(e) {
    if (locked || hidden) return;
    e.preventDefault();
    const r = chatEl.getBoundingClientRect();
    resizing = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    document.documentElement.classList.add('chat-dungsil-interacting');
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  }

  function onResizeMove(e) {
    if (!resizing) return;
    const r = chatEl.getBoundingClientRect();
    const w = Math.min(Math.max(Math.min(MIN_W, window.innerWidth), resizing.w + e.clientX - resizing.x), Math.max(1, window.innerWidth - r.left));
    const h = Math.min(Math.max(Math.min(MIN_H, window.innerHeight), resizing.h + e.clientY - resizing.y), Math.max(1, window.innerHeight - r.top));
    setImportant(chatEl, 'width', w + 'px');
    setImportant(chatEl, 'height', h + 'px');
    syncUI();
  }

  function onResizeEnd() {
    if (!resizing) return;
    resizing = null;
    document.documentElement.classList.remove('chat-dungsil-interacting');
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    persist(true);
    scheduleHide();
  }

  // ---------- 수동 지정 ----------

  function pickTargetFrom(start) {
    let el = start;
    while (el && el !== document.body && (el.offsetWidth < 150 || el.offsetHeight < 150)) {
      el = el.parentElement;
    }
    return !el || el === document.body ? start : el;
  }

  function togglePickMode() {
    if (pipWindow || pipPending) return;
    pickMode = !pickMode;
    document.body.classList.toggle('chat-dungsil-picking', pickMode);
    if (!pickMode && lastHover) {
      lastHover.classList.remove('chat-dungsil-hover-target');
      lastHover = null;
    }
    toast(
      pickMode
        ? '채팅창 수동 지정 모드 — 채팅창 영역을 클릭하세요 (취소: Alt(Option)+Shift+P)'
        : '수동 지정 모드를 종료했습니다.'
    );
  }

  document.addEventListener('mouseover', (e) => {
    if (!pickMode) return;
    if (lastHover) lastHover.classList.remove('chat-dungsil-hover-target');
    lastHover = pickTargetFrom(e.target);
    lastHover.classList.add('chat-dungsil-hover-target');
  });

  document.addEventListener(
    'click',
    (e) => {
      if (!pickMode || pipWindow || pipPending) return;
      e.preventDefault();
      e.stopPropagation();
      if (
        (handle && handle.contains(e.target)) ||
        (grip && grip.contains(e.target)) ||
        (chatEl && chatEl.contains(e.target))
      ) {
        toast('이미 관리 중인 채팅창입니다. 다른 영역을 클릭하세요.');
        return;
      }
      const el = pickTargetFrom(e.target);
      pickMode = false;
      document.body.classList.remove('chat-dungsil-picking');
      if (lastHover) {
        lastHover.classList.remove('chat-dungsil-hover-target');
        lastHover = null;
      }
      applyFloat(el);
      autoFloated = false;
      if (document.fullscreenElement) syncFullscreenState();
      toast('채팅창을 지정했습니다. 상단 바 드래그로 이동, 우하단 모서리로 크기조절.');
    },
    true
  );

  // ---------- 단축키 ----------

  function toggleFloatManual() {
    if (pipWindow || pipPending) return;
    if (floating) {
      optOutCurrentMode();
      unfloat();
      autoFloated = false;
      toast('채팅창을 원래 자리로 되돌렸습니다.');
      return;
    }
    const el = findChatContainer();
    if (!el) {
      toast('채팅창을 찾지 못했습니다. Alt(Option)+Shift+P로 직접 클릭해 지정하세요.');
      return;
    }
    applyFloat(el);
    autoFloated = false;
    if (document.fullscreenElement) syncFullscreenState();
    toast('채팅창 플로팅 ON — 상단 바 드래그로 이동, 우하단 모서리로 크기조절');
  }

  function setOpacity(v) {
    state.opacity = Math.min(1, Math.max(0.3, v));
    saveState();
    if (floating && chatEl && !(handle && handle.classList.contains('visible'))) {
      setImportant(chatEl, 'opacity', String(state.opacity));
    }
  }

  const OPACITY_STEPS = [1, 0.8, 0.6, 0.4];

  function cycleOpacity() {
    const idx = OPACITY_STEPS.findIndex((v) => Math.abs(v - state.opacity) < 0.05);
    setOpacity(OPACITY_STEPS[(idx + 1) % OPACITY_STEPS.length]);
    toast('채팅 투명도 ' + Math.round(state.opacity * 100) + '% (조절: Alt(Option)+Shift+O)');
  }

  document.addEventListener('keydown', (e) => {
    if (!state) return;
    if (!e.altKey || !e.shiftKey) return;
    // macOS에서 Option+Shift+문자는 e.key가 특수문자로 바뀌므로 e.code로 판별한다.
    if (e.code === 'KeyC') {
      e.preventDefault();
      toggleFloatManual();
    } else if (e.code === 'KeyO') {
      e.preventDefault();
      cycleOpacity();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      if (floating && !pipWindow && !pipPending) resetCurrentMode();
    } else if (e.code === 'KeyP') {
      e.preventDefault();
      togglePickMode();
    }
  });

  // J는 치지직 기본 동작(채팅창 활성화/입력 포커스)을 가로채지 않고 그대로 둔다.
  // 사이트가 J로 채팅창을 띄우면 자동 감지가 이어받아 플로팅한다. 다만 직접
  // 숨겨둔 상태(fsOptOut)에서 J를 누르면 자동 감지를 다시 켠다.
  window.addEventListener(
    'keydown',
    (e) => {
      if (IS_YT) return; // 유튜브의 J는 10초 되감기라 개입하지 않는다
      if (e.code !== 'KeyJ' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!document.fullscreenElement || floating) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      fsOptOut = false;
      startAutoFloatPoll();
    },
    true
  );

  // ---------- 팝업(확장 아이콘) 연동 ----------

  function status() {
    return {
      version: INJECTED_VERSION,
      floating,
      opacity: state.opacity,
      fontSize: state.fontSize,
      supportsChatAppearance: !IS_YT,
      hideChatBanner: state.hideChatBanner,
      hideChatRanking: state.hideChatRanking,
      mode: currentMode(),
      chatFound: !!(floating && chatEl?.isConnected) || !!findChatContainer(),
      autoTheater: state.autoTheater,
      locked,
      hidden,
      pip: !!pipWindow && !pipWindow.closed,
      pipSupported: !!window.documentPictureInPicture?.requestWindow,
      pipPending,
      pipError,
    };
  }

  function setHidden(value) {
    if (pipWindow || pipPending) return;
    hidden = !!value && floating;
    if (hidden) {
      cancelInteraction();
      handle?.classList.remove('visible');
      grip?.classList.remove('visible');
    }
    if (chatEl) setImportant(chatEl, 'visibility', hidden ? 'hidden' : 'visible');
  }

  function setFontSize(value) {
    if (value !== null && FONT.normalize(value) === null) return;
    state.fontSize = value;
    saveState();
    if (!IS_YT) FONT.apply(document, value);
    syncFontControls();
  }

  function syncFontControls() {
    for (const toolbar of [pageFontToolbar, pipWindow?.document.querySelector('#chat-dungsil-pip-font-toolbar')]) {
      if (toolbar) FONT.renderToolbar(toolbar, state.fontSize);
    }
  }

  function createFontToolbar(doc, prefix) {
    return FONT.createToolbar(doc, prefix, action => setFontSize(FONT.nextSize(state.fontSize, action)));
  }

  function syncPageFontToolbar() {
    if (!state) return;
    const root = floating && chatEl?.isConnected ? chatEl : findChatContainer();
    if (!root) {
      pageFontToolbar?.remove();
      pageFontToolbar = null;
      return;
    }
    if (!pageFontToolbar || pageFontToolbar.parentElement !== root) {
      pageFontToolbar?.remove();
      root.querySelector('#chat-dungsil-page-font-toolbar')?.remove();
      pageFontToolbar = createFontToolbar(document, 'chat-dungsil-page-font');
      root.prepend(pageFontToolbar);
      syncFontControls();
    }
  }

  function setChatAppearance(key, value) {
    if (IS_YT) return;
    state[key] = value === true;
    saveState();
    globalThis.chatDungsilAppearance?.apply(document, state.hideChatBanner, state.hideChatRanking);
  }

  function pipChatUrl() {
    if (!IS_YT) {
      const match = location.pathname.match(/^\/live\/([^/]+)(?:\/chat)?\/?$/);
      return match ? location.origin + '/live/' + match[1] + '/chat' : null;
    }
    const frame = (chatEl || document).querySelector('iframe[src*="live_chat"]') ||
      document.querySelector('ytd-live-chat-frame iframe[src]');
    if (frame) {
      const url = new URL(frame.getAttribute('src'), location.href);
      if (url.origin === location.origin && /^\/live_chat(?:_replay)?$/.test(url.pathname) && url.searchParams.get('v')) {
        return url.href;
      }
    }
    const videoId = location.pathname === '/watch' ? new URL(location.href).searchParams.get('v') : null;
    return videoId ? location.origin + '/live_chat?v=' + encodeURIComponent(videoId) + '&is_popout=1' : null;
  }

  function removePipFallback() {
    pipFallbackButton?.remove();
    pipFallbackButton = null;
  }

  function showPipFallback() {
    if (pipFallbackButton) return;
    pipFallbackButton = document.createElement('button');
    pipFallbackButton.id = 'chat-dungsil-pip-open';
    pipFallbackButton.type = 'button';
    pipFallbackButton.textContent = '외부 PiP 창 열기';
    pipFallbackButton.addEventListener('click', () => { openPip(); });
    overlayHost().appendChild(pipFallbackButton);
    toast('PiP 창을 열려면 페이지의 「외부 PiP 창 열기」 버튼을 클릭하세요.', 5000);
  }

  function restorePipSource(snapshot = pipSnapshot) {
    if (pipSource?.isConnected && pipSourceVisibility) {
      const { value, priority } = snapshot && pipSource !== snapshot.source
        ? snapshot.sourceVisibility : pipSourceVisibility;
      if (value) pipSource.style.setProperty('visibility', value, priority);
      else pipSource.style.removeProperty('visibility');
    }
    pipSource = null;
    pipSourceVisibility = null;
  }

  function hidePipSource(el) {
    if (pipSource === el) return;
    restorePipSource();
    pipSource = el;
    pipSourceVisibility = {
      value: el.style.getPropertyValue('visibility'),
      priority: el.style.getPropertyPriority('visibility'),
    };
    setImportant(el, 'visibility', 'hidden');
    handle?.classList.remove('visible');
    grip?.classList.remove('visible');
  }

  function closePip() {
    pipRequestId++;
    pipPending = false;
    const win = pipWindow;
    pipWindow = null;
    if (win && !win.closed) win.close();
    const snapshot = pipSnapshot;
    pipSnapshot = null;
    const latestSource = pipSource;
    restorePipSource(snapshot);
    removePipFallback();
    if (!snapshot) return;
    if (latestSource?.isConnected && latestSource !== chatEl && latestSource.classList.contains('chat-dungsil-float')) {
      latestSource.classList.remove('chat-dungsil-float');
      if (savedStyle) latestSource.setAttribute('style', savedStyle);
      else latestSource.removeAttribute('style');
    }
    if (snapshot.floating) {
      if (!floating || !chatEl?.isConnected) {
        if (floating) unfloat();
        const fresh = findChatContainer();
        if (fresh) applyFloat(fresh);
      }
      hidden = snapshot.hidden;
      autoFloated = snapshot.autoFloated;
      if (floating) syncFullscreenState();
    } else {
      if (floating) unfloat();
      hidden = snapshot.hidden;
      autoFloated = snapshot.autoFloated;
    }
  }

  async function openPip() {
    if (pipWindow?.closed) closePip();
    if (pipWindow && !pipWindow.closed) return { ...status(), error: '' };
    if (pipPending) return { ...status(), error: 'PiP 창을 여는 중입니다.' };
    pipError = '';
    if (!window.documentPictureInPicture?.requestWindow) {
      pipError = '이 브라우저는 외부 PiP 창을 지원하지 않습니다.';
      return { ...status(), error: pipError };
    }
    const source = floating && chatEl?.isConnected ? chatEl : findChatContainer();
    const src = pipChatUrl();
    if (!source || !src) {
      pipError = !source ? '채팅창을 찾지 못했습니다.' : '독립 채팅 주소를 찾지 못했습니다.';
      return { ...status(), error: pipError };
    }
    const requestId = ++pipRequestId;
    const openedAt = location.href;
    pipPending = true;
    try {
      // 사용자 클릭 활성화를 유지하려면 requestWindow 호출 전에 await를 두지 않는다.
      const request = window.documentPictureInPicture.requestWindow({ width: 400, height: 600 });
      const win = await request;
      if (requestId !== pipRequestId || location.href !== openedAt) {
        win.close();
        return { ...status(), error: '' };
      }
      const frame = win.document.createElement('iframe');
      frame.src = src;
      frame.title = '독립 채팅';
      frame.name = 'chat-dungsil-pip';
      win.document.title = '독립 채팅';
      win.document.body.style.cssText = 'margin:0;width:100vw;height:100vh;overflow:hidden;display:flex;flex-direction:column';
      const toolbar = createFontToolbar(win.document, 'chat-dungsil-pip-font');
      win.document.body.appendChild(toolbar);
      frame.style.cssText = 'display:block;border:0;width:100%;flex:1;min-height:0';
      win.document.body.appendChild(frame);
      pipWindow = win;
      syncFontControls();
      if (pickMode) {
        pickMode = false;
        document.body.classList.remove('chat-dungsil-picking');
        lastHover?.classList.remove('chat-dungsil-hover-target');
        lastHover = null;
      }
      pipSnapshot = {
        floating, hidden, autoFloated, url: openedAt, source,
        sourceVisibility: {
          value: source.style.getPropertyValue('visibility'),
          priority: source.style.getPropertyPriority('visibility'),
        },
      };
      if (!floating) applyFloat(source);
      hidePipSource(source);
      updateYtFsStyle();
      pipPending = false;
      removePipFallback();
      win.addEventListener('pagehide', () => { if (pipWindow === win) closePip(); }, { once: true });
      return { ...status(), error: '' };
    } catch (error) {
      if (requestId !== pipRequestId) return { ...status(), error: '' };
      pipPending = false;
      pipError = error.name === 'NotAllowedError'
        ? '브라우저가 팝업 클릭을 허용하지 않았습니다. 페이지 버튼을 눌러 여세요.'
        : 'PiP 창을 열지 못했습니다: ' + error.message;
      if (error.name === 'NotAllowedError') showPipFallback();
      return { ...status(), error: pipError };
    }
  }

  // 같은 사이트의 다른 탭·채팅 팝업 창에서 저장한 설정을 받아, 이후 이 탭의 저장이 이전 값으로 되돌리지 않게 한다.
  // 이 탭이 저장해 발생한 변경은 값이 같아 아무것도 바꾸지 않는다.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY] || !state) return;
    const next = normalize(changes[STORAGE_KEY].newValue || {});
    // 드래그·크기 조절 중에는 조작이 끝날 때 저장할 위치·크기를 덮어쓰지 않는다.
    const interacting = !!(dragging || resizing);
    const changed = new Set();
    for (const key of Object.keys(next)) {
      if (interacting && (key === 'fs' || key === 'normal' || key === 'theater')) continue;
      if (JSON.stringify(state[key]) === JSON.stringify(next[key])) continue;
      state[key] = next[key];
      changed.add(key);
    }
    if (!changed.size) return;
    if (changed.has('locked')) {
      locked = state.locked;
      if (locked) cancelInteraction();
    }
    if (floating && chatEl && !dragging && !resizing &&
      ['fs', 'normal', 'theater', 'opacity'].some(key => changed.has(key))) {
      applyMode(currentMode());
      // 마우스가 채팅 위에 있어 조작 UI가 보이는 동안은 불투명하게 둔다.
      if (handle?.classList.contains('visible')) setImportant(chatEl, 'opacity', '1');
    }
    syncUI();
    if (changed.has('fontSize')) syncFontControls();
  });

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.type || !state) return;
      if (msg.type === 'getStatus') {
        sendResponse(status());
      } else if (msg.type === 'setPip') {
        if (msg.value) (async () => sendResponse(await openPip()))();
        else {
          closePip();
          pipError = '';
          sendResponse({ ...status(), error: '' });
        }
        return true;
      } else if (msg.type === 'toggleFloat') {
        if (!pipWindow && !pipPending) toggleFloatManual();
        sendResponse(status());
      } else if (msg.type === 'reset') {
        if (floating && !pipWindow && !pipPending) resetCurrentMode();
        sendResponse(status());
      } else if (msg.type === 'setOpacity') {
        setOpacity(msg.value);
        sendResponse(status());
      } else if (msg.type === 'setFontSize') {
        setFontSize(msg.value);
        sendResponse(status());
      } else if (msg.type === 'setChatBannerHidden' || msg.type === 'setChatRankingHidden') {
        setChatAppearance(msg.type === 'setChatBannerHidden' ? 'hideChatBanner' : 'hideChatRanking', msg.value);
        sendResponse(status());
      } else if (msg.type === 'setAutoTheater') {
        state.autoTheater = !!msg.value;
        if (state.autoTheater) theaterOptOut = false;
        saveState();
        syncModeState();
        sendResponse(status());
      } else if (msg.type === 'setLocked') {
        if (!pipWindow && !pipPending) {
          locked = !!msg.value;
          state.locked = locked;
          if (locked) cancelInteraction();
          saveState();
          syncUI();
        }
        sendResponse(status());
      } else if (msg.type === 'setHidden') {
        setHidden(msg.value);
        sendResponse(status());
      }
    });
  }

  // ---------- 전체화면 ----------

  // 유튜브는 채팅 패널이 열린 채 전체화면에 들어가면 오른쪽에 채팅 컬럼을
  // 예약하고 영상을 그만큼 줄인다. 채팅을 플로팅으로 표시하는 동안에는 그
  // 예약을 풀어 영상이 전체 폭을 쓰게 한다. 유튜브에서만 스타일을 넣는다(IS_YT 검사).
  const YT_FS_STYLE_ID = 'chat-dungsil-yt-fs';

  function updateYtFsStyle() {
    const need = IS_YT && floating && (currentMode() === 'fs' || currentMode() === 'theater');
    let styleEl = document.getElementById(YT_FS_STYLE_ID);
    if (need && !styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = YT_FS_STYLE_ID;
      styleEl.textContent =
        'ytd-watch-flexy[fullscreen] #full-bleed-container,' +
        'ytd-watch-flexy[fullscreen] #player-full-bleed-container,' +
        'ytd-watch-flexy[theater] #full-bleed-container,' +
        'ytd-watch-flexy[theater] #player-full-bleed-container{' +
        'width:100vw!important;max-width:none!important;}' +
        'ytd-watch-flexy[fullscreen] #player-full-bleed-container,' +
        'ytd-watch-flexy[theater] #player-full-bleed-container{flex:none!important;}';
      document.head.appendChild(styleEl);
    } else if (!need && styleEl) {
      styleEl.remove();
    } else {
      return;
    }
    // 유튜브 플레이어가 바뀐 컨테이너 폭으로 영상 크기를 다시 계산하도록 유도
    setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
  }

  function syncFullscreenState() {
    if (!floating || !chatEl) return;
    const fsEl = document.fullscreenElement;
    if (fsEl) {
      if (!fsEl.contains(chatEl)) {
        placeholder = document.createComment('chat-dungsil-ph');
        chatEl.parentNode.insertBefore(placeholder, chatEl);
        fsEl.appendChild(chatEl);
      }
    } else if (placeholder) {
      if (placeholder.parentNode) placeholder.parentNode.insertBefore(chatEl, placeholder);
      placeholder.remove();
      placeholder = null;
    }
    ensureUI();
    // 재부착으로 fixed 기준(컨테이닝 블록)이 바뀌므로 오프셋을 다시 측정한다.
    posOffset = { x: 0, y: 0 };
    applyMode(currentMode());
    // 유튜브처럼 전체화면 요소 안에 있어도 조상이 숨겨져 렌더링되지 않는 경우:
    // 전체화면 요소 바로 아래로 옮겨서 보이게 한다.
    if (fsEl && !placeholder && chatEl.offsetWidth === 0) {
      placeholder = document.createComment('chat-dungsil-ph');
      chatEl.parentNode.insertBefore(placeholder, chatEl);
      fsEl.appendChild(chatEl);
      posOffset = { x: 0, y: 0 };
      applyMode(currentMode());
    }
    syncUI();
    updateYtFsStyle();
    window.dispatchEvent(new Event('resize'));
  }

  function optOutCurrentMode() {
    const mode = currentMode();
    if (mode === 'fs') fsOptOut = true;
    if (mode === 'theater') theaterOptOut = true;
  }

  function canAutoFloat(mode) {
    return (mode === 'fs' && !fsOptOut) ||
      (mode === 'theater' && state.autoTheater && !theaterOptOut);
  }

  function syncModeState() {
    if (!state) return;
    const mode = currentMode();
    if (pipWindow || pipPending) {
      if (mode !== lastMode) {
        stopAutoFloatPoll();
        lastMode = mode;
      }
      return;
    }
    if (mode !== lastMode) {
      stopAutoFloatPoll();
      if (lastMode === 'fs') fsOptOut = false;
      if (lastMode === 'theater') theaterOptOut = false;
      lastMode = mode;
      if (floating && autoFloated && !canAutoFloat(mode)) {
        unfloat();
        autoFloated = false;
      } else if (floating) {
        syncFullscreenState();
      }
    }
    if (floating && autoFloated && !canAutoFloat(mode)) {
      unfloat();
      autoFloated = false;
    }
    if (!floating && canAutoFloat(mode) && !autoFloatTimer) startAutoFloatPoll();
    if (floating) updateYtFsStyle();
  }

  function stopAutoFloatPoll() {
    clearInterval(autoFloatTimer);
    autoFloatTimer = null;
  }

  // 채팅 UI가 늦게 생성될 수 있어 해당 모드에서 나타날 때까지 감지한다.
  function startAutoFloatPoll() {
    stopAutoFloatPoll();
    const targetMode = currentMode();
    let lastEl = null;
    let lastW = -1;
    let lastH = -1;
    let stable = 0;
    autoFloatTimer = setInterval(() => {
      if (currentMode() !== targetMode || floating || pipWindow || pipPending || !canAutoFloat(targetMode)) {
        stopAutoFloatPoll();
        return;
      }
      const el = findChatContainer();
      if (!el) {
        lastEl = null;
        lastW = -1;
        lastH = -1;
        stable = 0;
        return;
      }
      // 열림 애니메이션 도중에 플로팅하면 사이트의 플레이어 폭 계산이 어긋난다.
      // 같은 요소가 0.5초(2틱) 동안 같은 크기를 유지할 때만 플로팅한다.
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (el !== lastEl || Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 2) {
        lastEl = el;
        lastW = w;
        lastH = h;
        stable = 0;
        return;
      }
      stable++;
      if (stable < 2) return;
      stopAutoFloatPoll();
      applyFloat(el);
      autoFloated = true;
      if (document.fullscreenElement) syncFullscreenState();
      else updateYtFsStyle();
      toast('채팅 플로팅 ON (해제: Alt(Option)+Shift+C)');
    }, 250);
  }

  document.addEventListener('fullscreenchange', () => {
    syncModeState();
  });

  window.addEventListener('scroll', () => {
    if (!floating || dragging || resizing) return;
    applyMode(currentMode());
    syncUI();
  });

  window.addEventListener('resize', () => {
    if (!floating || dragging || resizing) return;
    applyMode(currentMode());
    syncUI();
  });

  (async () => {
    await loadState();
    syncModeState();
    syncPageFontToolbar();
    setInterval(syncModeState, 250);
    setInterval(syncPageFontToolbar, 500);
    setInterval(() => {
      if (!pipWindow) return;
      if (pipWindow.closed || location.href !== pipSnapshot.url) {
        closePip();
        return;
      }
      if (!pipSource?.isConnected) {
        const fresh = findChatContainer();
        if (fresh) hidePipSource(fresh);
      } else if (getComputedStyle(pipSource).visibility !== 'hidden') {
        setImportant(pipSource, 'visibility', 'hidden');
      }
    }, 500);
    // 플로팅 중 사이트 리렌더링으로 채팅 요소가 교체되면 새 요소로 갈아탄다.
    setInterval(() => {
      if (pipWindow) return;
      if (!floating) return;
      if (chatEl && !chatEl.isConnected) {
        cancelInteraction();
        if (chatClassObserver) chatClassObserver.disconnect();
        chatClassObserver = null;
        chatEl = null;
        placeholder = null;
        if (handle) handle.classList.remove('visible');
        if (grip) grip.classList.remove('visible');
        const fresh = findChatContainer();
        if (fresh) {
          floating = false;
          applyFloat(fresh);
          if (document.fullscreenElement) syncFullscreenState();
        } else {
          floating = false;
          // 사이트의 채팅 닫기로 사라진 경우: 다시 열리면 이어받도록 감지를 재개
          if (canAutoFloat(currentMode())) startAutoFloatPoll();
          else toast('채팅창이 사라져 플로팅을 해제했습니다. Alt(Option)+Shift+C로 다시 켜세요.');
        }
      } else if (!hidden && chatEl.offsetWidth === 0) {
        // 사이트가 채팅을 숨긴 경우: 원상 복구하고, 다시 열릴 때를 대비해 감지 재개
        unfloat();
        autoFloated = false;
        if (canAutoFloat(currentMode())) startAutoFloatPoll();
      } else {
        if (!dragging && !resizing) {
          const mode = currentMode();
          const s = transientPosition[mode] || state[mode];
          if (s.left != null) {
            const r = chatEl.getBoundingClientRect();
            const expectedLeft = Math.max(0, Math.min(s.left, window.innerWidth - r.width));
            const expectedTop = Math.max(0, Math.min(s.top, window.innerHeight - r.height));
            if (Math.abs(r.left - expectedLeft) > 2 || Math.abs(r.top - expectedTop) > 2) applyMode(mode);
          }
        }
        syncUI();
      }
    }, 1000);
  })();
  window.addEventListener('pagehide', closePip);
})();
