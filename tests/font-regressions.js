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
  await popup.evaluate(() => chrome.storage.local.set({ 'chatDungsil:chzzk': {
    opacity: 0.6,
    normal: { left: 40, top: 50, width: 370, height: 480 },
  } }));
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const send = msg => popup.evaluate(async message => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.tabs.sendMessage(tab.id, message);
  }, msg);
  const stored = key => popup.evaluate(async storageKey =>
    (await chrome.storage.local.get(storageKey))[storageKey], key);
  const wait = () => page.waitForTimeout(150);

  const chzzkHtml = '<!doctype html><meta charset="utf-8"><style>#chat{width:360px;height:500px}</style>' +
    '<aside id="chat" class="live_chatting_area_wrapper">' +
    '<div role="log"><div class="_chatting_message_w9pvh_21"><button class="_nickname_w9pvh_33"><span class="_nickname_1mc5x_80"><span class="_ellipsis_1iatj_6"><span id="nickname" class="_text_1iatj_2">닉네임</span></span></span></button><span id="message" class="_text_w9pvh_1">본문</span><button id="chat-button">버튼</button><input id="chat-input"></div></div>' +
    '</aside>';
  await context.route('https://chzzk.naver.com/__font', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: chzzkHtml }));
  await page.goto('https://chzzk.naver.com/__font');
  await page.bringToFront();
  await wait();
  let status = await send({ type: 'getStatus' });
  const controls = await popup.evaluate(() => ({ slider: !!document.getElementById('fontSize'), value: !!document.getElementById('fontSizeValue'), reset: !!document.getElementById('fontSizeReset') }));
  record('기본 상태와 팝업 제어 표시', status.fontSize === null && controls.slider && controls.value && controls.reset,
    { status, controls });
  await popup.bringToFront();
  await popup.evaluate(() => render({ version: '1.0.0', floating: false, opacity: 1, fontSize: null, mode: 'normal' }));
  const defaultUi = await popup.evaluate(() => ({ label: document.getElementById('fontSizeValue')?.textContent, resetDisabled: document.getElementById('fontSizeReset')?.disabled }));
  record('기본값 UI 표시', defaultUi.label?.includes('사이트 기본값') && defaultUi.resetDisabled === true, defaultUi);
  const popupMessages = await popup.evaluate(async () => {
    const originalSend = send;
    const messages = [];
    send = async message => { messages.push(message); return null; };
    const slider = document.getElementById('fontSize');
    slider.value = '19';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('fontSizeReset').click();
    await Promise.resolve();
    await Promise.resolve();
    send = originalSend;
    return messages;
  });
  record('슬라이더와 기본 복원 메시지', popupMessages.some(message => message.type === 'setFontSize' && message.value === 19) &&
    popupMessages.some(message => message.type === 'setFontSize' && message.value === null), popupMessages);
  await page.bringToFront();
  await send({ type: 'setFontSize', value: 20 });
  await wait();
  status = await send({ type: 'getStatus' });
  let saved = await stored('chatDungsil:chzzk');
  record('치지직 상태와 기존 설정 보존', status.fontSize === 20 && saved.fontSize === 20 &&
    saved.opacity === 0.6 && saved.normal.left === 40, { status, saved });
  const fontState = () => page.evaluate(() => {
    const style = selector => getComputedStyle(document.querySelector(selector)).fontSize;
    return { nickname: style('#nickname'), text: style('#message'), button: style('#chat-button'), input: style('#chat-input') };
  });
  const styled = await fontState();
  record('닉네임과 본문에만 글자 크기 적용', styled.nickname === '20px' && styled.text === '20px' &&
    styled.button !== '20px' && styled.input !== '20px', styled);
  await context.route('https://chzzk.naver.com/live/abc/chat', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: chzzkHtml }));
  await page.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.src = '/live/abc/chat';
    document.body.appendChild(iframe);
  });
  await page.waitForTimeout(250);
  const nativeFrameFont = await page.frameLocator('iframe').locator('#message').evaluate(el => getComputedStyle(el).fontSize);
  const nativeFrameUi = await page.frameLocator('iframe').locator('#chat-dungsil-handle').count();
  record('치지직 팝아웃 iframe 글꼴 동기화와 중복 UI 방지', nativeFrameFont === '20px' && nativeFrameUi === 0,
    { nativeFrameFont, nativeFrameUi });
  await send({ type: 'setFontSize', value: 22 });
  await page.waitForTimeout(150);
  const nativeFrameChanged = await page.frameLocator('iframe').locator('#message').evaluate(el => getComputedStyle(el).fontSize);
  record('치지직 팝아웃 iframe 변경 수신', nativeFrameChanged === '22px', nativeFrameChanged);
  await send({ type: 'setFontSize', value: 20 });
  await page.evaluate(() => {
    document.querySelector('#chat').innerHTML = '<div role="log"><div class="_chatting_message_w9pvh_21"><span class="_nickname_1mc5x_80"><span class="_ellipsis_1iatj_6"><span id="nickname" class="_text_1iatj_2">새 닉</span></span></span><span id="message" class="_text_w9pvh_1">새 본문</span><button id="chat-button">버튼</button><input id="chat-input"></div></div>'; 
  });
  const replaced = await fontState();
  record('DOM 교체와 신규 메시지에도 적용', replaced.nickname === '20px' && replaced.text === '20px', replaced);
  await page.reload();
  await wait();
  status = await send({ type: 'getStatus' });
  record('새로고침 뒤 설정 복원', status.fontSize === 20 && (await fontState()).text === '20px', status);
  await send({ type: 'setFontSize', value: 24.5 });
  await send({ type: 'setFontSize', value: 25 });
  status = await send({ type: 'getStatus' });
  record('범위 밖·비정수 값 무시', status.fontSize === 20, status);
  await send({ type: 'setFontSize', value: null });
  await wait();
  status = await send({ type: 'getStatus' });
  saved = await stored('chatDungsil:chzzk');
  const resetStyles = await fontState();
  record('기본 복원과 스타일 제거', status.fontSize === null && saved.fontSize === null &&
    resetStyles.text !== '20px' && resetStyles.nickname !== '20px', { status, saved, resetStyles });

  const ytHtml = '<!doctype html><meta charset="utf-8"><ytd-live-chat-frame id="chat"><iframe src="/live_chat?v=abc"></iframe></ytd-live-chat-frame>';
  const frameHtml = '<!doctype html><meta charset="utf-8"><yt-live-chat-text-message-renderer>' +
    '<span id="author-name">닉네임</span><span id="message">본문</span><button id="chat-button">버튼</button><input id="chat-input">' +
    '</yt-live-chat-text-message-renderer>';
  await context.route('https://www.youtube.com/__font', route => route.fulfill({ contentType: 'text/html;charset=utf-8', body: ytHtml }));
  await context.route('https://www.youtube.com/live_chat?v=abc', route => route.fulfill({ contentType: 'text/html;charset=utf-8', body: frameHtml }));
  await page.goto('https://www.youtube.com/__font');
  await page.bringToFront();
  await wait();
  status = await send({ type: 'getStatus' });
  record('사이트별 기본값 분리', status.fontSize === null, status);
  await send({ type: 'setFontSize', value: 18 });
  await page.waitForTimeout(250);
  const ytStyle = await page.frameLocator('iframe').locator('#message').evaluate(el => getComputedStyle(el).fontSize);
  const ytAuthor = await page.frameLocator('iframe').locator('#author-name').evaluate(el => getComputedStyle(el).fontSize);
  const ytButton = await page.frameLocator('iframe').locator('#chat-button').evaluate(el => getComputedStyle(el).fontSize);
  record('유튜브 iframe 동기화와 채팅 텍스트 한정', ytStyle === '18px' && ytAuthor === '18px' && ytButton !== '18px',
    { ytStyle, ytAuthor, ytButton });
  const ytSaved = await stored('chatDungsil:youtube');
  const chzzkSaved = await stored('chatDungsil:chzzk');
  record('사이트별 저장 분리', ytSaved.fontSize === 18 && chzzkSaved.fontSize === null, { ytSaved, chzzkSaved });
  await context.route('https://www.youtube.com/live_chat_replay?v=abc', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: frameHtml }));
  await page.locator('iframe').evaluate(el => { el.src = '/live_chat_replay?v=abc'; });
  await page.waitForTimeout(250);
  const replayStyle = await page.frameLocator('iframe').locator('#message').evaluate(el => getComputedStyle(el).fontSize);
  record('다시보기 iframe에 저장값 적용', replayStyle === '18px', replayStyle);
  await send({ type: 'setFontSize', value: null });
  await page.waitForTimeout(250);
  const ytReset = await page.frameLocator('iframe').locator('#message').evaluate(el => getComputedStyle(el).fontSize);
  record('유튜브 iframe 기본 복원', ytReset !== '18px', ytReset);

  const popoutHtml = '<!doctype html><meta charset="utf-8"><yt-live-chat-app><div id="contents"><yt-live-chat-renderer>' +
    '<div id="chat-messages" style="display:flex;flex-direction:column"><div id="item-list">' + frameHtml.replace('<!doctype html><meta charset="utf-8">', '') +
    '</div></div></yt-live-chat-renderer></div></yt-live-chat-app>';
  await context.route('https://www.youtube.com/live_chat?v=popout&is_popout=1', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: popoutHtml }));
  await page.goto('https://www.youtube.com/live_chat?v=popout&is_popout=1');
  await page.bringToFront();
  await page.waitForTimeout(700);
  const popoutStatus = await send({ type: 'getStatus' });
  const popoutUi = await page.evaluate(() => ({
    handle: !!document.querySelector('#chat-dungsil-handle'),
    pageToolbar: !!document.querySelector('#chat-dungsil-page-font-toolbar'),
    toolbars: document.querySelectorAll('#chat-dungsil-popup-font-toolbar').length,
    first: document.querySelector('#chat-messages').firstElementChild?.id,
  }));
  record('유튜브 팝아웃 창은 전용 모드와 확장 툴바 하나만 사용', popoutStatus?.popupChat === true &&
    popoutStatus.site === 'youtube' && popoutStatus.supportsChatAppearance === false && !popoutUi.handle &&
    !popoutUi.pageToolbar && popoutUi.toolbars === 1 && popoutUi.first === 'chat-dungsil-popup-font-toolbar',
    { popoutStatus, popoutUi });
  const popoutSet = await send({ type: 'setFontSize', value: 19 });
  await wait();
  await page.locator('#chat-dungsil-popup-font-toolbar [data-action="increase"]').click();
  await wait();
  const popoutFont = {
    value: await page.locator('#chat-dungsil-popup-font-toolbar [data-action="value"]').textContent(),
    message: await page.locator('#message').evaluate(el => getComputedStyle(el).fontSize),
    saved: (await stored('chatDungsil:youtube')).fontSize,
    chzzk: (await stored('chatDungsil:chzzk')).fontSize,
  };
  record('유튜브 팝아웃 창 글자 크기 변경은 유튜브 설정에만 저장', popoutSet?.fontSize === 19 &&
    popoutFont.value === '20px' && popoutFont.message === '20px' && popoutFont.saved === 20 && popoutFont.chzzk === null,
    { popoutSet, popoutFont });
  await send({ type: 'setFontSize', value: null });

  await popup.close();
  return { pass: results.every(result => result.pass), results };
}
