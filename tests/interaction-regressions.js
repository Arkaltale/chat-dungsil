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

  const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#24303b}#chat{position:absolute;left:900px;top:60px;width:320px;height:600px;background:#456}</style><aside id="chat" class="live_chatting_area_wrapper">채팅 테스트</aside>';
  await context.route('https://chzzk.naver.com/__interaction', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: html }));
  await page.goto('https://chzzk.naver.com/__interaction');
  await page.bringToFront();
  await page.waitForTimeout(350);

  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const key = () => page.keyboard.press('Alt+Shift+KeyC');
  const box = selector => page.locator(selector).boundingBox();
  const ui = () => page.evaluate(() => ({
    hovered: document.querySelector('#chat').matches(':hover'),
    handleVisible: document.querySelector('#chat-dungsil-handle').classList.contains('visible'),
    gripVisible: document.querySelector('#chat-dungsil-grip').classList.contains('visible'),
    opacity: getComputedStyle(document.querySelector('#chat')).opacity,
  }));
  const errors = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));

  await page.keyboard.press('Alt+Shift+KeyO'); // 저장 투명도 80%
  await page.mouse.move(1000, 500);
  await key();
  await page.waitForTimeout(650);
  let state = await ui();
  record('토글 후 같은 채팅 위 호버 유지', state.hovered && state.handleVisible && state.gripVisible && state.opacity === '1', state);
  await page.mouse.move(5, 5);
  // 숨김 타이머(400ms) 뒤 opacity 트랜지션(150ms)이 끝날 때까지 기다린다.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#chat')).opacity === '0.8' &&
    !document.querySelector('#chat-dungsil-handle').classList.contains('visible'), null, { timeout: 2000 }).catch(() => {});
  state = await ui();
  record('채팅 이탈 시 설정 투명도 복구', !state.hovered && !state.handleVisible && !state.gripVisible && state.opacity === '0.8', state);

  await page.locator('#chat').hover();
  let rect = await box('#chat-dungsil-handle');
  await page.mouse.move(rect.x + 80, rect.y + 13);
  await page.mouse.down();
  await page.mouse.move(rect.x + 60, rect.y + 13);
  await key();
  await page.mouse.move(rect.x + 40, rect.y + 13);
  await page.mouse.up();
  await page.waitForTimeout(150);
  record('드래그 중 해제 후 예외 없음', errors.length === 0, [...errors]);

  await key();
  await page.locator('#chat').hover();
  rect = await box('#chat');
  let control = await box('#chat-dungsil-handle');
  await page.mouse.move(control.x + 80, control.y + 13);
  await page.mouse.down();
  await page.mouse.move(control.x + 40, control.y + 13);
  await page.mouse.up();
  let moved = await box('#chat');
  record('드래그 취소 후 다시 이동 가능', moved.x < rect.x - 10, { before: rect.x, after: moved.x });

  await page.locator('#chat').hover();
  control = await box('#chat-dungsil-grip');
  await page.mouse.move(control.x + 9, control.y + 9);
  await page.mouse.down();
  await page.mouse.move(control.x + 29, control.y + 29);
  await key();
  await page.mouse.move(control.x + 49, control.y + 49);
  await page.mouse.up();
  await page.waitForTimeout(150);
  record('리사이즈 중 해제 후 예외 없음', errors.length === 0, [...errors]);

  await key();
  await page.locator('#chat').hover();
  rect = await box('#chat');
  control = await box('#chat-dungsil-grip');
  await page.mouse.move(control.x + 9, control.y + 9);
  await page.mouse.down();
  await page.mouse.move(control.x + 39, control.y + 39);
  await page.mouse.up();
  moved = await box('#chat');
  record('리사이즈 취소 후 다시 크기 조절 가능', moved.width > rect.width + 10 && moved.height > rect.height + 10,
    { before: { width: rect.width, height: rect.height }, after: { width: moved.width, height: moved.height } });

  const iframeHtml = '<!doctype html><style>body{margin:0}#chat{position:absolute;left:900px;top:60px;width:320px;height:600px;display:block}#chat iframe{display:block;width:100%;height:100%;border:0}</style><ytd-live-chat-frame id="chat"><iframe srcdoc="<body style=background:#456>채팅</body>"></iframe></ytd-live-chat-frame>';
  await context.route('https://www.youtube.com/__interaction', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: iframeHtml }));
  await page.goto('https://www.youtube.com/__interaction');
  await page.waitForTimeout(350);
  await key();
  await page.locator('#chat').hover();
  rect = await box('#chat');
  control = await box('#chat-dungsil-grip');
  await page.mouse.move(control.x + 9, control.y + 9);
  await page.mouse.down();
  await page.mouse.move(control.x - 100, control.y - 150, { steps: 5 });
  await page.mouse.up();
  moved = await box('#chat');
  let pointerEvents = await page.locator('#chat iframe').evaluate(frame => getComputedStyle(frame).pointerEvents);
  record('iframe 안으로 축소 드래그', moved.width < rect.width - 80 && moved.height < rect.height - 120,
    { before: { width: rect.width, height: rect.height }, after: { width: moved.width, height: moved.height } });
  record('리사이즈 종료 후 iframe 입력 복구', pointerEvents === 'auto', pointerEvents);

  await page.locator('#chat').hover();
  control = await box('#chat-dungsil-grip');
  await page.mouse.move(control.x + 9, control.y + 9);
  await page.mouse.down();
  await page.mouse.move(control.x - 20, control.y - 20);
  await key();
  pointerEvents = await page.locator('#chat iframe').evaluate(frame => getComputedStyle(frame).pointerEvents);
  record('리사이즈 도중 해제 후 iframe 입력 복구', pointerEvents === 'auto', pointerEvents);
  await page.mouse.up();

  await cdp.detach();
  await popup.close();
  return { pass: results.every(result => result.pass), results };
}
