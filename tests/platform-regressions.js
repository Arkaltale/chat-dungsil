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
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(() => chrome.storage.local.clear());
  await popup.close();

  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const key = () => page.keyboard.press('Alt+Shift+KeyC');
  const wait = ms => page.waitForTimeout(ms);
  const chatState = () => page.evaluate(() => {
    const chat = document.querySelector('#aside-chatting');
    const rect = chat?.getBoundingClientRect();
    return {
      float: chat?.classList.contains('chat-dungsil-float'),
      visible: !!rect?.width && !!rect?.height && getComputedStyle(chat).display !== 'none',
      width: rect?.width,
      height: rect?.height,
      handle: !!document.querySelector('#chat-dungsil-handle.visible'),
      inFullscreen: !!document.fullscreenElement?.contains(chat),
    };
  });

  const chzzkHtml = `<!doctype html><meta charset="utf-8">
    <style>
      body{margin:0;background:#222;color:white}
      #player{position:relative;width:100vw;height:100vh;background:#234}
      #aside-chatting{position:absolute;right:0;top:0;width:360px;height:596px;background:#345}
      ._is_folded_mock{display:none!important}
    </style>
    <div id="player"><button id="enter" onclick="document.querySelector('#player').requestFullscreen()">전체화면</button>
      <aside id="aside-chatting" class="live_chatting_area_wrapper">실제 채팅 메시지</aside>
    </div>`;
  await context.route('https://chzzk.naver.com/__platform', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: chzzkHtml }));
  await page.goto('https://chzzk.naver.com/__platform');
  await wait(300);

  await key();
  let state = await chatState();
  record('치지직 알려진 채팅 노드 선택', state.float && state.width === 360, state);
  await page.locator('#enter').click();
  await page.evaluate(() => { document.querySelector('#aside-chatting').className = '_is_folded_mock'; });
  await wait(1300);
  state = await chatState();
  record('React 클래스 교체 뒤 수동 전체화면 플로팅 유지', state.float && state.visible && state.inFullscreen && state.height === 520, state);
  await page.evaluate(() => {
    const chat = document.querySelector('#aside-chatting');
    for (let i = 0; i < 5; i++) chat.className = '_is_folded_mock';
  });
  await wait(200);
  state = await chatState();
  record('반복 클래스 교체에도 플로팅 유지', state.float && state.visible, state);
  await page.evaluate(() => {
    document.querySelector('#aside-chatting').className = 'live_chatting_area_wrapper';
    return document.exitFullscreen();
  });
  await wait(300);
  state = await chatState();
  record('전체화면 이탈 뒤 수동 플로팅 유지', state.float && state.visible && !state.inFullscreen, state);

  await page.evaluate(() => {
    const old = document.querySelector('#aside-chatting');
    old.outerHTML = '<aside id="aside-chatting" class="live_chatting_area_wrapper">교체된 채팅 메시지</aside>';
  });
  await wait(1250);
  state = await chatState();
  record('DOM 교체 뒤 새 채팅에 재연결', state.float && state.visible, state);
  await key();

  await page.reload();
  await wait(300);
  await page.evaluate(() => {
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) document.querySelector('#aside-chatting').className = '_is_folded_mock';
    });
  });
  await page.locator('#enter').click();
  await wait(1250);
  state = await chatState();
  record('크기 0인 알려진 채팅 자동 플로팅', state.float && state.visible && state.inFullscreen, state);
  await page.evaluate(() => document.exitFullscreen());
  await wait(300);
  state = await chatState();
  record('자동 플로팅은 전체화면 종료 때 해제', !state.float && !state.inFullscreen, state);

  await page.reload();
  await wait(300);
  await page.locator('#enter').click();
  await wait(1100);
  await key();
  await wait(1150);
  state = await chatState();
  record('명시적 닫기 뒤 전체화면 자동 재활성화 없음', !state.float, state);
  await page.evaluate(() => document.exitFullscreen());

  const youtubeHtml = `<!doctype html><meta charset="utf-8">
    <style>
      body{margin:0;background:#222;color:white}
      ytd-watch-flexy{display:block;width:100vw;height:100vh}
      #columns{display:flex;width:100vw;height:700px}
      #player-full-bleed-container{flex:1 1 0%;width:100vw;height:700px;background:#246}
      #panels{flex:none;width:352px;height:700px;background:#333}
      #chat-container{width:352px;height:596px;background:#444}
      ytd-live-chat-frame{display:block;width:352px;height:596px;min-height:596px;background:#567}
      iframe{display:block;width:100%;height:100%;border:0;background:#789}
    </style>
    <ytd-watch-flexy id="watch"><button id="enter" onclick="document.querySelector('#watch').requestFullscreen()">전체화면</button>
      <div id="columns"><div id="player-full-bleed-container"></div><div id="panels"><div id="chat-container">
        <ytd-live-chat-frame id="chat"><iframe></iframe></ytd-live-chat-frame>
      </div></div></div>
    </ytd-watch-flexy>`;
  await context.route('https://www.youtube.com/__platform', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: youtubeHtml }));
  await page.goto('https://www.youtube.com/__platform');
  await wait(300);
  const ytState = () => page.evaluate(() => {
    const frame = document.querySelector('ytd-live-chat-frame');
    const iframe = frame.querySelector('iframe');
    const toolbar = frame.querySelector('#chat-dungsil-page-font-toolbar');
    return {
      frameFloat: frame.classList.contains('chat-dungsil-float'),
      containerFloat: document.querySelector('#chat-container').classList.contains('chat-dungsil-float'),
      height: frame.getBoundingClientRect().height,
      availableHeight: innerHeight - frame.getBoundingClientRect().top,
      iframeHeight: iframe.getBoundingClientRect().height,
      toolbarBottom: toolbar?.getBoundingClientRect().bottom,
      iframeTop: iframe.getBoundingClientRect().top,
      iframeBottom: iframe.getBoundingClientRect().bottom,
      frameBottom: frame.getBoundingClientRect().bottom,
      playerWidth: document.querySelector('#player-full-bleed-container').getBoundingClientRect().width,
      viewportWidth: innerWidth,
      frameParent: frame.parentElement.id,
      stylePresent: !!document.querySelector('#chat-dungsil-yt-fs'),
    };
  });
  await key();
  let yt = await ytState();
  record('유튜브 실제 frame을 플로팅해 iframe 높이 일치', yt.frameFloat && !yt.containerFloat && yt.height === 520 && yt.iframeHeight === yt.height - 28 &&
    yt.toolbarBottom <= yt.iframeTop + 1 && yt.iframeBottom <= yt.frameBottom + 1, yt);
  const expectedHeight = Math.min(yt.height + 40, yt.availableHeight);
  const grip = await page.locator('#chat-dungsil-grip').boundingBox();
  await page.mouse.move(grip.x + 9, grip.y + 9);
  await page.mouse.down();
  await page.mouse.move(grip.x + 9, grip.y + 49);
  await page.mouse.up();
  yt = await ytState();
  record('유튜브 화면 경계까지 리사이즈 뒤 iframe 높이 일치', yt.frameFloat && Math.abs(yt.height - expectedHeight) < 1 && Math.abs(yt.iframeHeight - (yt.height - 28)) < 1 &&
    yt.toolbarBottom <= yt.iframeTop + 1 && yt.iframeBottom <= yt.frameBottom + 1, yt);
  await key();
  yt = await ytState();
  record('유튜브 도킹 복구', !yt.frameFloat && yt.frameParent === 'chat-container' && yt.height === 596, yt);

  await page.locator('#enter').click();
  await page.evaluate(() => document.querySelector('ytd-watch-flexy').setAttribute('fullscreen', ''));
  await wait(150);
  yt = await ytState();
  const dockedPlayerWidth = yt.playerWidth;
  await key();
  await wait(500);
  yt = await ytState();
  record('유튜브 전체화면 플로팅 중 플레이어 전체 폭', yt.frameFloat && yt.stylePresent && Math.abs(yt.playerWidth - yt.viewportWidth) < 1, { dockedPlayerWidth, ...yt });
  await page.evaluate(() => document.exitFullscreen());
  await wait(500);
  yt = await ytState();
  record('유튜브 전체화면 이탈 시 플레이어 원상 복구', !yt.stylePresent && yt.playerWidth === dockedPlayerWidth && yt.frameParent === 'chat-container', { dockedPlayerWidth, ...yt });

  const shellHtml = `<!doctype html><meta charset="utf-8">
    <style>body{margin:0}#shell{width:360px;height:500px}</style>
    <button id="enter" onclick="document.documentElement.requestFullscreen()">전체화면</button>
    <aside id="shell" class="live_chatting_area_wrapper"><div id="message">채팅 메시지</div></aside>`;
  await context.route('https://chzzk.naver.com/__platform_shell', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: shellHtml }));
  await page.goto('https://chzzk.naver.com/__platform_shell');
  await wait(700);
  const toolbarAttached = await page.evaluate(() => !!document.querySelector('#shell > #chat-dungsil-page-font-toolbar'));
  await page.evaluate(() => document.querySelector('#message').remove());
  await page.locator('#enter').click();
  await wait(1300);
  const shell = await page.evaluate(() => ({
    fullscreen: !!document.fullscreenElement,
    float: document.querySelector('#shell').classList.contains('chat-dungsil-float'),
    toolbar: !!document.querySelector('#chat-dungsil-page-font-toolbar'),
  }));
  record('글자 크기 도구만 남은 빈 채팅 컨테이너를 전체화면 자동 플로팅하지 않음',
    toolbarAttached && shell.fullscreen && !shell.float && !shell.toolbar, { toolbarAttached, ...shell });
  await page.evaluate(() => document.exitFullscreen().catch(() => {}));
  await wait(300);

  const ownUiHtml = `<!doctype html><meta charset="utf-8">
    <style>body{margin:0}#chat-dungsil-fake{width:360px;height:500px}</style>
    <div id="chat-dungsil-fake">확장이 만든 UI 문구</div>`;
  await context.route('https://chzzk.naver.com/__platform_own_ui', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: ownUiHtml }));
  await page.goto('https://chzzk.naver.com/__platform_own_ui');
  await wait(700);
  await key();
  await wait(100);
  const ownUi = await page.evaluate(() => ({
    float: document.querySelector('#chat-dungsil-fake').classList.contains('chat-dungsil-float'),
    toolbar: !!document.querySelector('#chat-dungsil-page-font-toolbar'),
    toast: document.querySelector('#chat-dungsil-toast')?.textContent || '',
  }));
  record('확장 자체 UI(id chat-dungsil-*)를 채팅 후보로 잡지 않음',
    !ownUi.float && !ownUi.toolbar && ownUi.toast.includes('찾지 못했습니다'), ownUi);

  return { pass: results.every(result => result.pass), results };
}
