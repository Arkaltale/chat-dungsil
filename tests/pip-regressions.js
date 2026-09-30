async page => {
  // 확장 ID는 설치 경로에서 파생되므로 치지직 fixture 의 확장 isolated world origin 에서 얻는다.
  const extensionId = await (async () => {
    const probe = await page.context().newPage();
    await probe.route('https://chzzk.naver.com/__extension_id', route =>
      route.fulfill({ contentType: 'text/html;charset=utf-8', body: '<!doctype html><title>id</title>' }));
    const cdp = await page.context().newCDPSession(probe);
    const origins = [];
    cdp.on('Runtime.executionContextCreated', event => origins.push(event.context.origin));
    await cdp.send('Runtime.enable');
    await probe.goto('https://chzzk.naver.com/__extension_id');
    let origin;
    for (let i = 0; i < 50 && !(origin = origins.find(item => item.startsWith('chrome-extension://'))); i++) await probe.waitForTimeout(100);
    await probe.close();
    if (!origin) throw new Error('확장 실행 컨텍스트에서 확장 ID를 찾지 못했습니다.');
    return origin.slice('chrome-extension://'.length);
  })();
  const context = page.context();
  const popup = await context.newPage();
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const extension = `chrome-extension://${extensionId}/popup.html`;
  const chatHtml = '<!doctype html><meta charset="utf-8"><aside class="_is_popup_chat_b8csn_13"><div class="_wrapper_1e2su_28 _scale_1e2su_39" id="native-scale">' +
    '<button class="_scale_button_1e2su_55" aria-label="채팅 크기 마이너스">−</button><span>100%</span>' +
    '<button class="_scale_button_1e2su_55" aria-label="채팅 크기 플러스">+</button></div><div id="native-chat" role="log"><div class="_chatting_message_w9pvh_21">' +
    '<span id="native-text" class="_text_w9pvh_1">독립 채팅</span></div></div></aside>';
  const liveHtml = '<!doctype html><meta charset="utf-8"><style>#aside-chatting{width:360px;height:500px}</style>' +
    '<div id="live_player_layout"><div id="player">영상</div></div><aside id="aside-chatting">원본 채팅</aside>' +
    '<button id="fullscreen" onclick="document.documentElement.requestFullscreen()">전체화면</button>' +
    '<button id="playerFullscreen" onclick="document.getElementById(\'player\').requestFullscreen()">영상만 전체화면</button>';
  await context.route('https://chzzk.naver.com/live/fixture', route =>
    route.fulfill({ contentType: 'text/html', body: liveHtml }));
  await context.route('https://chzzk.naver.com/live/fixture/chat', route =>
    route.fulfill({ contentType: 'text/html', body: chatHtml }));
  await page.goto('https://chzzk.naver.com/live/fixture');
  await page.bringToFront();
  await page.waitForTimeout(250);
  await popup.goto(extension);
  const send = msg => popup.evaluate(message => chrome.tabs.sendMessage(targetTabId, message, { frameId: 0 }), msg);
  const wait = () => page.waitForTimeout(650);
  const input = popup.locator('#pip');
  record('PiP 제어가 표시됨', await input.count() === 1, await input.count());
  if (await input.count()) {
    await popup.bringToFront();
    await input.click();
    await wait();
    const opened = await popup.evaluate(() => ({ checked: document.querySelector('#pip').checked,
      status: document.querySelector('#status')?.textContent }));
    const original = await page.locator('#aside-chatting').evaluate(el => getComputedStyle(el).visibility);
    const native = await page.evaluate(() => {
      const frame = documentPictureInPicture.window?.document.querySelector('iframe');
      const scale = frame?.contentDocument?.querySelector('#native-scale');
      return { src: frame?.src, content: frame?.contentDocument?.querySelector('#native-text')?.textContent,
        scaleDisplay: scale && frame.contentWindow.getComputedStyle(scale).display,
        popupToolbar: !!frame?.contentDocument?.querySelector('#chat-dungsil-popup-font-toolbar') };
    });
    record('팝업 ON으로 독립 채팅을 열고 원본을 숨김', opened.checked &&
      opened.status.includes('외부 PiP 표시 중') && original === 'hidden' &&
      native.src === 'https://chzzk.naver.com/live/fixture/chat' && native.content === '독립 채팅',
      { opened, original, native });
    const standalone = await page.context().newPage();
    await standalone.goto('https://chzzk.naver.com/live/fixture/chat');
    await standalone.waitForTimeout(700);
    const popupChat = await standalone.evaluate(() => ({
      scale: getComputedStyle(document.querySelector('#native-scale')).display,
      toolbars: document.querySelectorAll('#chat-dungsil-popup-font-toolbar').length,
      first: document.querySelector('aside').firstElementChild?.id,
    }));
    record('PiP·치지직 채팅 팝업에서 치지직 크기 버튼 숨김과 확장 툴바 단일 표시',
      native.scaleDisplay === 'none' && !native.popupToolbar && popupChat.scale === 'none' &&
      popupChat.toolbars === 1 && popupChat.first === 'chat-dungsil-popup-font-toolbar', { native, popupChat });
    const inspectToolbar = ([where, selector]) => {
      const doc = where === 'pip' ? documentPictureInPicture.window.document : document;
      const toolbar = doc.querySelector(selector);
      return { styles: doc.querySelectorAll('style#chat-dungsil-font-toolbar-style').length,
        height: toolbar?.getBoundingClientRect().height,
        gap: toolbar && doc.defaultView.getComputedStyle(toolbar).columnGap };
    };
    const sharedToolbars = {
      page: await page.evaluate(inspectToolbar, ['page', '#chat-dungsil-page-font-toolbar']),
      pip: await page.evaluate(inspectToolbar, ['pip', '#chat-dungsil-pip-font-toolbar']),
      popupChat: await standalone.evaluate(inspectToolbar, ['page', '#chat-dungsil-popup-font-toolbar']),
    };
    record('페이지·PiP·채팅 팝업 창 글자 크기 도구가 공용 스타일 한 벌과 28px 높이 사용',
      Object.values(sharedToolbars).every(item => item.styles === 1 && item.height === 28 && item.gap === '4px'),
      sharedToolbars);
    const fontBefore = (await send({ type: 'getStatus' })).fontSize;
    const fontExpected = (fontBefore ?? 16) + 1;
    await standalone.locator('#chat-dungsil-popup-font-toolbar [data-action="increase"]').click();
    await standalone.waitForTimeout(200);
    const popupSync = {
      value: await standalone.locator('#chat-dungsil-popup-font-toolbar [data-action="value"]').textContent(),
      font: await standalone.locator('#native-text').evaluate(el => getComputedStyle(el).fontSize),
      status: (await send({ type: 'getStatus' })).fontSize,
      pipValue: await page.evaluate(() =>
        documentPictureInPicture.window?.document.querySelector('#chat-dungsil-pip-font-value')?.textContent),
    };
    await send({ type: 'setOpacity', value: 0.8 });
    const storedFont = (await popup.evaluate(() => chrome.storage.local.get('chatDungsil:chzzk')))['chatDungsil:chzzk']?.fontSize;
    record('채팅 팝업 툴바 변경이 방송 탭 상태와 이후 저장에 반영', popupSync.value === fontExpected + 'px' &&
      popupSync.font === fontExpected + 'px' && popupSync.status === fontExpected &&
      popupSync.pipValue === fontExpected + 'px' && storedFont === fontExpected,
      { fontBefore, popupSync, storedFont });
    await standalone.bringToFront();
    const popupChatSend = msg => popup.evaluate(async message => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id, message, { frameId: 0 });
    }, msg);
    const popupChatStatus = await popupChatSend({ type: 'getStatus' });
    const popupChatFont = await popupChatSend({ type: 'setFontSize', value: 19 });
    const popupChatBanner = await popupChatSend({ type: 'setChatBannerHidden', value: true });
    const popupChatInvalid = await popupChatSend({ type: 'setFontSize', value: 99 });
    const popupChatToolbar = await standalone.locator('#chat-dungsil-popup-font-toolbar [data-action="value"]').textContent();
    await page.bringToFront();
    await send({ type: 'setOpacity', value: 0.7 });
    const afterMainSave = (await popup.evaluate(() => chrome.storage.local.get('chatDungsil:chzzk')))['chatDungsil:chzzk'];
    record('채팅 팝업 창의 확장 팝업 응답과 설정 변경 유지', popupChatStatus?.popupChat === true &&
      popupChatStatus.version === '1.0.0' && popupChatFont?.fontSize === 19 && popupChatBanner?.hideChatBanner === true &&
      popupChatInvalid?.fontSize === 19 && popupChatToolbar === '19px' &&
      afterMainSave.fontSize === 19 && afterMainSave.hideChatBanner === true && afterMainSave.opacity === 0.7,
      { popupChatStatus, popupChatFont, popupChatBanner, popupChatInvalid, popupChatToolbar, afterMainSave });
    await send({ type: 'setOpacity', value: 1 });
    await send({ type: 'setChatBannerHidden', value: false });
    await send({ type: 'setFontSize', value: fontBefore });
    await standalone.close();
    await page.bringToFront();
    await input.click();
    await wait();
    const off = await send({ type: 'getStatus' });
    const visible = await page.locator('#aside-chatting').evaluate(el => getComputedStyle(el).visibility);
    record('팝업 OFF로 docked 상태 복원', !off.pip && !off.floating && visible === 'visible', { off, visible });

    await input.click();
    await wait();
    const viewer = await page.context().newPage();
    await viewer.goto(extension.replace('popup.html', 'watch.html?tabId=-1'));
    await viewer.locator('#pip').click();
    await wait();
    const replaced = await send({ type: 'getStatus' });
    const replacedVisible = await page.locator('#aside-chatting').evaluate(el => getComputedStyle(el).visibility);
    const watchPipOpen = await viewer.evaluate(() => !!documentPictureInPicture.window?.document.querySelector('#messages'));
    record('모아보기 PiP가 열려 채팅 PiP가 닫히면 docked 복원', watchPipOpen && !replaced.pip &&
      !replaced.floating && replacedVisible === 'visible', { watchPipOpen, replaced, replacedVisible });
    await viewer.close();
    await page.bringToFront();

    const pressPick = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'P', code: 'KeyP', altKey: true, shiftKey: true, bubbles: true,
    })));
    await pressPick();
    const pickingBeforePip = await page.evaluate(() => document.body.classList.contains('chat-dungsil-picking'));
    await input.click();
    await wait();
    const pickingAfterOpen = await page.evaluate(() => document.body.classList.contains('chat-dungsil-picking'));
    await pressPick();
    await page.locator('#player').click();
    const pickingDuringPip = await page.evaluate(() => ({
      picking: document.body.classList.contains('chat-dungsil-picking'),
      playerFloat: document.querySelector('#player').classList.contains('chat-dungsil-float'),
    }));
    const protectedStatus = await send({ type: 'getStatus' });
    record('PiP에서 기존 수동 지정 취소와 단축키 차단', pickingBeforePip &&
      !pickingAfterOpen && !pickingDuringPip.picking && !pickingDuringPip.playerFloat && protectedStatus.pip,
      { pickingBeforePip, pickingAfterOpen, pickingDuringPip, protectedStatus });
    await send({ type: 'setPip', value: false });
    await wait();

    await send({ type: 'toggleFloat' });
    await send({ type: 'setHidden', value: true });
    await input.click();
    await wait();
    await page.evaluate(() => documentPictureInPicture.window.close());
    await wait();
    const closed = await send({ type: 'getStatus' });
    record('PiP X로 플로팅·숨김 복원', !closed.pip && closed.floating && closed.hidden,
      closed);
    await send({ type: 'setHidden', value: false });
    await wait();
    await input.click();
    await wait();
    await page.bringToFront();
    await page.locator('#playerFullscreen').click();
    await wait();
    const playerFullscreen = await page.evaluate(() => document.fullscreenElement?.id || null);
    await send({ type: 'setPip', value: false });
    const restoredIntoFullscreen = await page.locator('#player').evaluate(el =>
      el.contains(document.querySelector('#aside-chatting')));
    record('원래 플로팅 중 영상만 전체화면으로 바뀐 뒤 PiP 종료 복원',
      playerFullscreen === 'player' && restoredIntoFullscreen,
      { playerFullscreen, restoredIntoFullscreen });
    await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    await wait();
    await page.bringToFront();
    await page.locator('#playerFullscreen').click();
    await wait();
    const startedFullscreen = await page.evaluate(() => ({
      fullscreen: document.fullscreenElement?.id || null,
      inPlayer: document.querySelector('#player').contains(document.querySelector('#aside-chatting')),
    }));
    await popup.bringToFront();
    await input.click();
    await wait();
    await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    await wait();
    await send({ type: 'setPip', value: false });
    const reverseRestored = await page.evaluate(() => {
      const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
      let placeholder = 0;
      while (walker.nextNode()) if (walker.currentNode.textContent === 'chat-dungsil-ph') placeholder++;
      return { parent: document.querySelector('#aside-chatting').parentElement?.tagName, placeholder };
    });
    record('전체화면에서 PiP 열고 F 이탈 후 원래 부모 복원',
      startedFullscreen.fullscreen === 'player' && startedFullscreen.inPlayer &&
      reverseRestored.parent === 'BODY' && reverseRestored.placeholder === 0,
      { startedFullscreen, reverseRestored });
    await send({ type: 'toggleFloat' });

    await send({ type: 'setFontSize', value: 20 });
    await wait();
    await input.click();
    await wait();
    const pipFont = await page.evaluate(() => {
      const text = documentPictureInPicture.window.document.querySelector('iframe').contentDocument.querySelector('#native-text');
      return getComputedStyle(text).fontSize;
    });
    record('PiP native iframe에 글꼴 설정 적용', pipFont === '20px', pipFont);
    const pipControls = () => page.evaluate(() => {
      const doc = documentPictureInPicture.window?.document;
      const frame = doc?.querySelector('iframe');
      return { count: doc?.querySelectorAll('#chat-dungsil-pip-font-toolbar').length,
        value: doc?.querySelector('#chat-dungsil-pip-font-value')?.textContent,
        text: frame?.contentDocument?.querySelector('#native-text') ?
          getComputedStyle(frame.contentDocument.querySelector('#native-text')).fontSize : null,
        inputBottom: frame?.getBoundingClientRect().bottom,
        windowHeight: doc?.documentElement.clientHeight };
    });
    const pipClick = action => page.evaluate(name =>
      documentPictureInPicture.window.document.querySelector('#chat-dungsil-pip-font-' + name).click(), action);
    let controls = await pipControls();
    record('PiP 도구 표시와 iframe 높이 보존', controls.count === 1 && controls.value === '20px' &&
      controls.text === '20px' && controls.inputBottom <= controls.windowHeight, controls);
    await pipClick('increase');
    await wait();
    controls = await pipControls();
    record('PiP에서 글자 크기 증가·저장', controls.value === '21px' && controls.text === '21px' &&
      (await send({ type: 'getStatus' })).fontSize === 21, controls);
    await send({ type: 'setFontSize', value: 24 });
    controls = await pipControls();
    const maxDisabled = await page.evaluate(() =>
      documentPictureInPicture.window.document.querySelector('#chat-dungsil-pip-font-increase').disabled);
    record('PiP 최대값 경계', controls.value === '24px' && maxDisabled, { controls, maxDisabled });
    await send({ type: 'setFontSize', value: 12 });
    const minDisabled = await page.evaluate(() =>
      documentPictureInPicture.window.document.querySelector('#chat-dungsil-pip-font-decrease').disabled);
    record('PiP 최소값 경계', minDisabled && (await pipControls()).value === '12px', minDisabled);
    await popup.locator('#fontSize').fill('18');
    await popup.locator('#fontSize').dispatchEvent('input');
    await wait();
    controls = await pipControls();
    record('팝업에서 변경 시 PiP 값 동기화', controls.value === '18px' && controls.text === '18px', controls);
    await pipClick('reset');
    await wait();
    controls = await pipControls();
    record('PiP 기본값 복원', controls.value === '기본값' &&
      (await send({ type: 'getStatus' })).fontSize === null, controls);
    await send({ type: 'setPip', value: false });
    await wait();
    await input.click();
    await wait();
    record('PiP 재열기 후 조절 UI 복원', (await pipControls()).count === 1 &&
      (await pipControls()).value === '기본값', await pipControls());
    await send({ type: 'setFontSize', value: 20 });
    await page.locator('#fullscreen').click();
    await wait();
    const fs = await send({ type: 'getStatus' });
    const hiddenInFs = await page.locator('#aside-chatting').evaluate(el => getComputedStyle(el).visibility);
    record('전체화면 요청 중 PiP 유지', fs.pip && hiddenInFs === 'hidden', { fs, hiddenInFs });
    await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    await send({ type: 'setPip', value: false });
    await send({ type: 'setFontSize', value: null });
    await wait();

    await input.click();
    await wait();
    await page.locator('#aside-chatting').evaluate(el => {
      const next = el.cloneNode(true);
      next.id = 'aside-chatting';
      el.replaceWith(next);
    });
    await wait();
    const replacement = await page.locator('#aside-chatting').evaluate(el => getComputedStyle(el).visibility);
    const replacementStatus = await send({ type: 'getStatus' });
    await send({ type: 'setPip', value: false });
    const restoredReplacement = await page.locator('#aside-chatting').evaluate(el => getComputedStyle(el).visibility);
    record('원본 DOM 교체 시 새 요소 숨김과 종료 복원', replacementStatus.pip &&
      replacement === 'hidden' && restoredReplacement === 'visible',
      { replacementStatus, replacement, restoredReplacement });

    await popup.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'pip-race';
      button.textContent = '연속 ON';
      button.onclick = () => {
        window.pipRace = Promise.all([
          send({ type: 'setPip', value: true }),
          send({ type: 'setPip', value: true }),
        ]);
      };
      document.body.appendChild(button);
    });
    await popup.locator('#pip-race').click();
    const race = await popup.evaluate(() => window.pipRace);
    const raceStatus = await send({ type: 'getStatus' });
    const raceFrames = await page.evaluate(() => documentPictureInPicture.window?.document.querySelectorAll('iframe').length);
    record('연속 ON 요청은 PiP 창 하나로 수렴', raceStatus.pip &&
      race.every(response => response.pip) && raceFrames === 1,
      { race, raceStatus, raceFrames });
    await send({ type: 'setPip', value: false });
    await wait();

    await popup.evaluate(() => {
      document.querySelector('#pip-race').onclick = () => {
        window.pipRace = Promise.all([
          send({ type: 'setPip', value: true }),
          send({ type: 'setPip', value: false }),
        ]);
      };
    });
    await popup.locator('#pip-race').click();
    await popup.evaluate(() => window.pipRace);
    await wait();
    const canceled = await send({ type: 'getStatus' });
    const canceledVisibility = await page.locator('#aside-chatting').evaluate(el => getComputedStyle(el).visibility);
    record('열리는 중 OFF가 늦게 열린 창을 닫음', !canceled.pip && !canceled.pipPending &&
      !canceled.floating && canceledVisibility === 'visible', { canceled, canceledVisibility });

    await input.click();
    await wait();
    await page.evaluate(() => history.pushState(null, '', '/live/changed'));
    await wait();
    const navigated = await send({ type: 'getStatus' });
    record('방송 URL 변경 시 PiP 자동 종료', !navigated.pip && !navigated.floating, navigated);
    await page.locator('#aside-chatting').evaluate(el => el.remove());
    await wait();
    const missing = await send({ type: 'setPip', value: true });
    await wait();
    const unavailableUi = await popup.evaluate(() => ({ disabled: document.querySelector('#pip').disabled,
      checked: document.querySelector('#pip').checked }));
    record('채팅 미탐지 시 PiP 거부와 스위치 비활성화', !missing.pip &&
      missing.error.includes('채팅창을 찾지') && unavailableUi.disabled && !unavailableUi.checked,
      { missing, unavailableUi });

    await page.goto('https://chzzk.naver.com/live/fixture');
    await wait();
    const cdp = await context.newCDPSession(page);
    const worlds = [];
    cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context));
    await cdp.send('Runtime.enable');
    const frameTree = await cdp.send('Page.getFrameTree');
    const mainFrameId = frameTree.frameTree.frame.id;
    const world = worlds.find(item => item.origin === `chrome-extension://${extensionId}` &&
      item.auxData?.frameId === mainFrameId);
    if (!world) throw new Error('메인 프레임의 확장 실행 컨텍스트를 찾지 못했습니다.');
    const override = async expression => cdp.send('Runtime.evaluate', { contextId: world.id, expression });
    await override("window.__pipApi = window.documentPictureInPicture; Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: undefined });");
    const unsupported = await send({ type: 'setPip', value: true });
    await wait();
    const unsupportedUi = await popup.evaluate(() => document.querySelector('#pip').disabled);
    record('미지원 브라우저 안내', !unsupported.pip && !unsupported.pipSupported &&
      unsupported.error.includes('지원하지') && unsupportedUi,
      { unsupported, unsupportedUi });
    await override("Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow() { return Promise.reject(new DOMException('blocked', 'NotAllowedError')); } } });");
    await wait();
    await input.click();
    await wait();
    const denied = await send({ type: 'getStatus' });
    const fallback = await page.locator('#chat-dungsil-pip-open').count();
    record('사용자 제스처 거부 시 페이지 열기 버튼 표시', !denied.pip &&
      denied.pipError.includes('페이지 버튼') && fallback === 1, { denied, fallback });
    await override("Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: window.__pipApi }); delete window.__pipApi;");
    if (fallback) {
      await page.locator('#chat-dungsil-pip-open').click();
      await wait();
      const retried = await send({ type: 'getStatus' });
      record('페이지 버튼에서 PiP 재시도 성공', retried.pip &&
        await page.locator('#chat-dungsil-pip-open').count() === 0, retried);
      await send({ type: 'setPip', value: false });
    }
    await cdp.detach();

    const ytHtml = '<!doctype html><meta charset="utf-8"><ytd-watch-flexy theater>' +
      '<ytd-live-chat-frame><iframe src="/live_chat_replay?v=video123"></iframe></ytd-live-chat-frame></ytd-watch-flexy>';
    const ytChat = '<!doctype html><meta charset="utf-8"><yt-live-chat-text-message-renderer>' +
      '<span id="message">유튜브 독립 채팅</span></yt-live-chat-text-message-renderer>';
    await context.route('https://www.youtube.com/watch?v=video123', route =>
      route.fulfill({ contentType: 'text/html', body: ytHtml }));
    await context.route('https://www.youtube.com/live_chat_replay?v=video123', route =>
      route.fulfill({ contentType: 'text/html', body: ytChat }));
    await page.goto('https://www.youtube.com/watch?v=video123');
    await wait();
    await send({ type: 'setFontSize', value: 19 });
    await input.click();
    await wait();
    const ytPip = await page.evaluate(() => {
      const frame = documentPictureInPicture.window?.document.querySelector('iframe');
      const message = frame?.contentDocument?.querySelector('#message');
      return { src: frame?.src, message: message?.textContent,
        font: message ? getComputedStyle(message).fontSize : null };
    });
    const ytState = await send({ type: 'getStatus' });
    const ytOriginal = await page.locator('ytd-live-chat-frame').evaluate(el => getComputedStyle(el).visibility);
    record('유튜브 replay 독립 iframe과 T 모드 글꼴', ytState.pip && ytState.mode === 'theater' &&
      ytOriginal === 'hidden' && ytPip.src === 'https://www.youtube.com/live_chat_replay?v=video123' &&
      ytPip.message === '유튜브 독립 채팅' && ytPip.font === '19px',
      { ytPip, ytState, ytOriginal });
    await send({ type: 'setPip', value: false });
    await send({ type: 'setFontSize', value: null });
    await wait();

    const ytFallbackHtml = '<!doctype html><meta charset="utf-8"><style>#chat{display:block;width:360px;height:500px}</style>' +
      '<ytd-live-chat-frame id="chat">원본 채팅</ytd-live-chat-frame>';
    await context.route('https://www.youtube.com/watch?v=fallback123', route =>
      route.fulfill({ contentType: 'text/html', body: ytFallbackHtml }));
    await context.route('https://www.youtube.com/live_chat?v=fallback123&is_popout=1', route =>
      route.fulfill({ contentType: 'text/html', body: ytChat }));
    await page.goto('https://www.youtube.com/watch?v=fallback123');
    await wait();
    await input.click();
    await wait();
    const ytFallbackSrc = await page.evaluate(() => documentPictureInPicture.window?.document.querySelector('iframe')?.src);
    record('원본 iframe이 없을 때 watch v로 채팅 주소 생성',
      ytFallbackSrc === 'https://www.youtube.com/live_chat?v=fallback123&is_popout=1', ytFallbackSrc);
    await send({ type: 'setPip', value: false });
  }
  await popup.close();
  return { pass: results.every(result => result.pass), results };
}
