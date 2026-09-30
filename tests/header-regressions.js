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
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const send = msg => popup.evaluate(message => chrome.tabs.sendMessage(targetTabId, message, { frameId: 0 }), msg);
  const read = () => page.evaluate(() => {
    const root = document.querySelector('#aside-chatting');
    const visible = selector => getComputedStyle(root.querySelector(selector)).display !== 'none';
    return {
      banner: visible('[class*="_banner_"]'), ranking: visible('div:has(> button[class*="_ranking_button_"])'),
      notice: visible('#notice'), log: visible('[role="log"]'), input: visible('#chat-input'),
      bannerHeight: root.querySelector('[class*="_banner_"]').getBoundingClientRect().height,
      rankingHeight: root.querySelector('[class*="_ranking_button_"]').parentElement.getBoundingClientRect().height,
    };
  });
  const html = '<!doctype html><meta charset="utf-8"><style>#aside-chatting{display:flex;flex-direction:column;width:360px;height:500px}#aside-chatting>[role=log]{flex:1}</style>' +
    '<aside id="aside-chatting"><div class="_container_tuhxw_1 _banner_b8csn_41" style="height:40px">배너</div>' +
    '<div class="_container_wl8bq_2" style="height:35px"><button class="_ranking_button_wl8bq_141">후원순위</button></div>' +
    '<div id="notice">고정공지</div><div role="log">채팅</div><input id="chat-input"></aside>';
  const native = '<!doctype html><meta charset="utf-8"><aside class="_is_popup_chat_1">' +
    '<div class="_banner_123" style="height:40px">배너</div>' +
    '<div style="height:35px"><button class="_ranking_button_123">후원순위</button></div>' +
    '<div role="log">채팅</div><input id="chat-input"></aside>';
  await context.route('https://chzzk.naver.com/live/fixture', route => route.fulfill({ contentType: 'text/html', body: html }));
  await context.route('https://chzzk.naver.com/live/fixture/chat', route => route.fulfill({ contentType: 'text/html', body: native }));
  await page.goto('https://chzzk.naver.com/live/fixture');
  await page.bringToFront();
  await page.waitForTimeout(600);
  await popup.reload();
  await page.waitForTimeout(300);
  let st = await send({ type: 'getStatus' });
  let view = await read();
  record('기본값 OFF와 원본 유지', st.supportsChatAppearance && !st.hideChatBanner && !st.hideChatRanking &&
    view.banner && view.ranking && view.notice && view.log && view.input, { st, view });
  const toolbar = page.locator('#chat-dungsil-page-font-toolbar');
  record('도킹 채팅 글자 조절 UI 한 개', await toolbar.count() === 1 &&
    await page.locator('#chat-dungsil-page-font-value').textContent() === '기본값', await toolbar.count());
  await page.locator('#chat-dungsil-page-font-increase').click();
  st = await send({ type: 'getStatus' });
  record('원본 채팅에서 글자 크기 증가', st.fontSize === 17 &&
    await page.locator('#chat-dungsil-page-font-value').textContent() === '17px', st);
  await page.locator('#chat-dungsil-page-font-reset').click();
  await send({ type: 'toggleFloat' });
  await page.waitForTimeout(150);
  record('플로팅에도 같은 조절 UI 유지', await toolbar.count() === 1 &&
    await page.locator('#chat-dungsil-page-font-value').textContent() === '기본값', await toolbar.count());
  await send({ type: 'toggleFloat' });
  await send({ type: 'setChatBannerHidden', value: true });
  view = await read();
  record('배너만 숨김과 공간 제거', !view.banner && view.bannerHeight === 0 && view.ranking && view.notice && view.log && view.input, view);
  await send({ type: 'setChatRankingHidden', value: true });
  view = await read();
  record('후원순위 독립 숨김과 공간 제거', !view.banner && !view.ranking && view.rankingHeight === 0, view);
  await send({ type: 'setChatBannerHidden', value: false });
  view = await read();
  record('독립 복원', view.banner && !view.ranking && view.notice && view.log && view.input, view);
  await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/live/fixture/chat'; document.body.appendChild(frame); });
  await page.waitForTimeout(300);
  const nativeView = await page.frameLocator('iframe').locator('aside').evaluate(root => ({
    banner: getComputedStyle(root.querySelector('[class*="_banner_"]')).display,
    ranking: getComputedStyle(root.querySelector('[class*="_ranking_button_"]').parentElement).display,
    log: getComputedStyle(root.querySelector('[role="log"]')).display,
  }));
  record('native iframe 저장값 연동', nativeView.banner !== 'none' && nativeView.ranking === 'none' && nativeView.log !== 'none', nativeView);
  await page.reload();
  await page.waitForTimeout(600);
  st = await send({ type: 'getStatus' });
  view = await read();
  record('재로드 설정 복원', !st.hideChatBanner && st.hideChatRanking && view.banner && !view.ranking, { st, view });
  await page.evaluate(() => { document.querySelector('#aside-chatting').outerHTML = document.querySelector('#aside-chatting').outerHTML; });
  await page.waitForTimeout(600);
  view = await read();
  record('DOM 교체 후에도 적용', view.banner && !view.ranking && view.notice && view.log && view.input &&
    await toolbar.count() === 1, view);
  await popup.bringToFront();
  await popup.waitForTimeout(600);
  const popupState = await popup.evaluate(() => ({ visible: !document.querySelector('#chatAppearance').hidden,
    banner: document.querySelector('#hideChatBanner').checked, ranking: document.querySelector('#hideChatRanking').checked }));
  record('치지직 팝업 체크 상태', popupState.visible && !popupState.banner && popupState.ranking, popupState);
  await popup.locator('#hideChatBanner').check();
  await page.waitForTimeout(200);
  st = await send({ type: 'getStatus' });
  record('팝업 체크 메시지', st.hideChatBanner && st.hideChatRanking, st);
  await context.route('https://www.youtube.com/watch?v=fixture', route => route.fulfill({ contentType: 'text/html', body: '<ytd-live-chat-frame><iframe src="/live_chat?v=fixture"></iframe></ytd-live-chat-frame>' }));
  await page.goto('https://www.youtube.com/watch?v=fixture');
  await page.waitForTimeout(600);
  st = await send({ type: 'getStatus' });
  await popup.waitForTimeout(600);
  const ytUi = await popup.evaluate(() => document.querySelector('#chatAppearance').hidden);
  record('유튜브 영향 없음', !st.supportsChatAppearance && !st.hideChatBanner && !st.hideChatRanking && ytUi, { st, ytUi });
  await popup.close();
  return { pass: results.every(result => result.pass), results };
}
