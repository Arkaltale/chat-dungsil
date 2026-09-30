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
  const send = msg => popup.evaluate(async message => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.tabs.sendMessage(tab.id, message);
  }, msg);
  const wait = ms => page.waitForTimeout(ms);
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const bounds = () => page.evaluate(() => {
    const chat = document.querySelector('#chat');
    const handle = document.querySelector('#chat-dungsil-handle');
    const grip = document.querySelector('#chat-dungsil-grip');
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return { chat: rect(chat), handle: rect(handle), grip: rect(grip), vw: innerWidth, vh: innerHeight };
  });
  const inside = b => [b.chat, b.handle, b.grip].every(r =>
    r.left >= -1 && r.top >= -1 && r.right <= b.vw + 1 && r.bottom <= b.vh + 1);

  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0}ytd-watch-flexy{display:block;width:100vw;height:100vh}
    #player-full-bleed-container{width:calc(100vw - 352px);height:400px;background:#234}
    ytd-live-chat-frame{display:block;width:352px;height:596px;background:#456}
    iframe{display:block;width:100%;height:100%;border:0}
  </style><ytd-watch-flexy id="watch">
    <button id="enter" onclick="document.querySelector('#watch').requestFullscreen()">전체화면</button>
    <div id="player-full-bleed-container"></div><ytd-live-chat-frame id="chat"><iframe></iframe></ytd-live-chat-frame>
  </ytd-watch-flexy>`;
  await context.route('https://www.youtube.com/__usability', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: html }));
  await page.goto('https://www.youtube.com/__usability');
  await page.bringToFront();
  await wait(350);

  let st = await send({ type: 'getStatus' });
  const manifestVersion = await popup.evaluate(() => chrome.runtime.getManifest().version);
  record('상태 계약과 주입 버전', st.version === manifestVersion && st.mode === 'normal' && st.chatFound &&
    st.autoTheater === false && st.locked === false && st.hidden === false, st);

  await send({ type: 'toggleFloat' });
  await popup.evaluate(() => chrome.storage.local.set({ 'chatDungsil:youtube': {
    normal: { left: 900, top: 300, width: 980, height: 760 },
    fs: { left: null, top: null, width: 360, height: 520 },
    opacity: 1,
  } }));
  await page.reload();
  await wait(350);
  await send({ type: 'toggleFloat' });
  await page.setViewportSize({ width: 320, height: 260 });
  await wait(200);
  let b = await bounds();
  record('작은 창에서 전체 박스와 조작 핸들 접근', inside(b) && b.chat.width <= 320 && b.chat.height <= 260, b);
  await page.locator('#chat').hover();
  const control = await page.locator('#chat-dungsil-handle').boundingBox();
  await page.mouse.move(control.x + 35, control.y + 13);
  await page.mouse.down();
  await page.mouse.move(2000, 2000);
  await page.mouse.up();
  b = await bounds();
  record('드래그가 전체 박스를 화면 안에 유지', inside(b), b);
  const stored = await popup.evaluate(() => chrome.storage.local.get('chatDungsil:youtube'));
  record('작은 창 보정이 큰 창 선호값 보존', stored['chatDungsil:youtube'].normal.width === 980 &&
    stored['chatDungsil:youtube'].normal.height === 760, stored);
  await page.setViewportSize({ width: 1280, height: 900 });
  await wait(150);
  b = await bounds();
  record('창 복원 시 선호 크기 복구', b.chat.width === 980 && b.chat.height === 760 && inside(b), b);

  st = await send({ type: 'setLocked', value: true });
  await page.reload();
  await wait(350);
  await send({ type: 'toggleFloat' });
  st = await send({ type: 'getStatus' });
  record('잠금 설정이 새로고침 뒤 유지', st.floating && st.locked, st);
  const before = await bounds();
  await page.locator('#chat').hover();
  const handle = await page.locator('#chat-dungsil-handle').boundingBox();
  await page.mouse.move(handle.x + 35, handle.y + 13);
  await page.mouse.down();
  await page.mouse.move(handle.x + 90, handle.y + 30);
  await page.mouse.up();
  b = await bounds();
  record('잠금 중 드래그 방지', st.locked && b.chat.left === before.chat.left && b.chat.top === before.chat.top, { before, after: b });
  await page.locator('#chat').hover();
  const lockedGrip = await page.locator('#chat-dungsil-grip').boundingBox();
  await page.mouse.move(lockedGrip.x + 9, lockedGrip.y + 9);
  await page.mouse.down();
  await page.mouse.move(lockedGrip.x - 50, lockedGrip.y - 50);
  await page.mouse.up();
  b = await bounds();
  record('잠금 중 크기 조절 방지', b.chat.width === before.chat.width && b.chat.height === before.chat.height,
    { before, after: b });
  st = await send({ type: 'setHidden', value: true });
  const hiddenState = await page.evaluate(() => ({ visibility: getComputedStyle(document.querySelector('#chat')).visibility,
    handle: document.querySelector('#chat-dungsil-handle').classList.contains('visible') }));
  record('임시 숨김 중 플로팅 유지', st.floating && st.hidden && hiddenState.visibility === 'hidden' && !hiddenState.handle, hiddenState);
  st = await send({ type: 'setHidden', value: false });
  record('임시 숨김 복구', st.floating && !st.hidden &&
    await page.locator('#chat').evaluate(el => getComputedStyle(el).visibility === 'visible'), st);
  await send({ type: 'setLocked', value: false });
  await send({ type: 'toggleFloat' });

  await send({ type: 'setAutoTheater', value: true });
  await page.evaluate(() => document.querySelector('#watch').setAttribute('theater', ''));
  await wait(1100);
  st = await send({ type: 'getStatus' });
  let playerWidth = await page.locator('#player-full-bleed-container').evaluate(el => el.getBoundingClientRect().width);
  record('유튜브 T 자동 플로팅과 영상 폭', st.mode === 'theater' && st.floating &&
    playerWidth === 1280, { status: st, playerWidth });
  b = await bounds();
  record('기존 일반 위치를 T 최초값으로 복제', b.chat.width === 980 && b.chat.height === 760, b);
  await page.locator('#chat').hover();
  const theaterGrip = await page.locator('#chat-dungsil-grip').boundingBox();
  await page.mouse.move(theaterGrip.x + 9, theaterGrip.y + 9);
  await page.mouse.down();
  await page.mouse.move(theaterGrip.x - 71, theaterGrip.y - 61);
  await page.mouse.up();
  b = await bounds();
  record('T 크기 변경은 T 위치에만 저장', b.chat.width === 900 && b.chat.height === 690 &&
    (await popup.evaluate(() => chrome.storage.local.get('chatDungsil:youtube')))['chatDungsil:youtube'].normal.width === 980, b);
  await page.locator('#enter').click();
  await wait(250);
  st = await send({ type: 'getStatus' });
  record('T에서 전체화면으로 자동 플로팅 유지', st.mode === 'fs' && st.floating, st);
  await page.evaluate(() => document.exitFullscreen());
  await wait(250);
  st = await send({ type: 'getStatus' });
  b = await bounds();
  record('전체화면에서 T로 독립 크기 복구', st.mode === 'theater' && st.floating &&
    b.chat.width === 900 && b.chat.height === 690, { status: st, bounds: b });
  await page.evaluate(() => document.querySelector('#watch').removeAttribute('theater'));
  await wait(400);
  st = await send({ type: 'getStatus' });
  record('일반 화면 복귀 시 자동 도킹', st.mode === 'normal' && !st.floating, st);

  await page.evaluate(() => document.querySelector('#watch').setAttribute('theater', ''));
  await wait(1000);
  await send({ type: 'toggleFloat' });
  await wait(900);
  st = await send({ type: 'getStatus' });
  record('T 모드 수동 해제 후 재활성화 방지', st.mode === 'theater' && !st.floating, st);
  await send({ type: 'setAutoTheater', value: false });
  await send({ type: 'setAutoTheater', value: true });
  await wait(1100);
  st = await send({ type: 'getStatus' });
  record('T 옵션 재활성화 시 수동 해제 상태 해소', st.mode === 'theater' && st.floating && st.autoTheater, st);
  await page.evaluate(() => document.querySelector('#watch').removeAttribute('theater'));
  await wait(300);

  await page.setViewportSize({ width: 320, height: 260 });
  await send({ type: 'toggleFloat' });
  await page.locator('#chat').hover();
  const smallGrip = await page.locator('#chat-dungsil-grip').boundingBox();
  await page.mouse.move(smallGrip.x + 9, smallGrip.y + 9);
  await page.mouse.down();
  await page.mouse.move(smallGrip.x - 51, smallGrip.y - 51);
  await page.mouse.up();
  b = await bounds();
  const resizedStorage = (await popup.evaluate(() => chrome.storage.local.get('chatDungsil:youtube')))['chatDungsil:youtube'];
  record('작은 창에서 명시적 크기 조절 저장', b.chat.width === 260 && b.chat.height === 200 &&
    resizedStorage.normal.width === 260 && resizedStorage.normal.height === 200, { bounds: b, saved: resizedStorage.normal });
  await page.setViewportSize({ width: 1280, height: 900 });
  await wait(150);
  b = await bounds();
  record('명시적으로 조절한 크기가 창 복원 뒤 유지', b.chat.width === 260 && b.chat.height === 200, b);

  const chzzk = '<!doctype html><style>#live_player_layout{height:600px}#chat{width:360px;height:500px}</style>' +
    '<div id="live_player_layout"><aside id="chat" class="live_chatting_area_wrapper">채팅</aside></div>';
  await context.route('https://chzzk.naver.com/__usability', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: chzzk }));
  await page.goto('https://chzzk.naver.com/__usability');
  await wait(350);
  await send({ type: 'setAutoTheater', value: true });
  await page.evaluate(() => document.querySelector('#live_player_layout').classList.add('is_large'));
  await wait(1000);
  st = await send({ type: 'getStatus' });
  record('치지직 실제 T DOM 신호 자동 플로팅', st.mode === 'theater' && st.floating, st);

  // 같은 사이트 두 탭: 한 탭의 저장이 다른 탭에서 바꾼 설정을 되돌리지 않아야 한다.
  // 확장에 tabs 권한이 없어 URL로 탭을 찾을 수 없으므로, 앞으로 가져온 활성 탭의 ID를 기억해 둔다.
  const tabIds = {};
  const rememberTab = async path => {
    tabIds[path] = await popup.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  };
  const sendTo = (path, msg) => popup.evaluate(([tabId, message]) =>
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }), [tabIds[path], msg]);
  const ytStored = async () => (await popup.evaluate(() => chrome.storage.local.get('chatDungsil:youtube')))['chatDungsil:youtube'];
  await popup.evaluate(() => chrome.storage.local.set({ 'chatDungsil:youtube': {
    normal: { left: 500, top: 200, width: 360, height: 500 },
    opacity: 1,
  } }));
  await context.route(/^https:\/\/www\.youtube\.com\/__sync_[ab]$/, route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: html }));
  await page.goto('https://www.youtube.com/__sync_a');
  await page.bringToFront();
  await rememberTab('__sync_a');
  const other = await context.newPage();
  await other.goto('https://www.youtube.com/__sync_b');
  await other.bringToFront();
  await rememberTab('__sync_b');
  await page.bringToFront();
  await wait(350);
  await sendTo('__sync_a', { type: 'setOpacity', value: 0.6 });
  await sendTo('__sync_a', { type: 'setLocked', value: true });
  await wait(100);
  await sendTo('__sync_b', { type: 'setFontSize', value: 15 });
  await wait(100);
  const syncedSaved = await ytStored();
  const statusA = await sendTo('__sync_a', { type: 'getStatus' });
  const statusB = await sendTo('__sync_b', { type: 'getStatus' });
  record('다른 탭 저장이 탭 A의 투명도·잠금을 되돌리지 않고 탭 B 상태에 반영',
    syncedSaved.opacity === 0.6 && syncedSaved.locked === true && syncedSaved.fontSize === 15 &&
    statusB.opacity === 0.6 && statusB.locked === true && statusA.fontSize === 15 && statusA.locked === true,
    { syncedSaved, statusA, statusB });

  await sendTo('__sync_a', { type: 'setLocked', value: false });
  await sendTo('__sync_a', { type: 'toggleFloat' });
  await sendTo('__sync_b', { type: 'toggleFloat' });
  await wait(150);
  const dragStart = await page.locator('#chat').boundingBox();
  await page.locator('#chat').hover();
  const syncHandle = await page.locator('#chat-dungsil-handle').boundingBox();
  await page.mouse.move(syncHandle.x + 35, syncHandle.y + 13);
  await page.mouse.down();
  await page.mouse.move(syncHandle.x + 35 - 200, syncHandle.y + 13 - 100);
  await popup.evaluate(async () => {
    const current = (await chrome.storage.local.get('chatDungsil:youtube'))['chatDungsil:youtube'];
    await chrome.storage.local.set({ 'chatDungsil:youtube': {
      ...current, normal: { left: 10, top: 10, width: 300, height: 300 },
    } });
  });
  await wait(150);
  const midDrag = await page.locator('#chat').boundingBox();
  await page.mouse.up();
  await wait(150);
  const draggedSaved = await ytStored();
  const otherBox = await other.locator('#chat').boundingBox();
  record('드래그 중 다른 탭 저장이 위치를 덮지 않고 놓은 위치가 다른 탭에 반영',
    midDrag.x === dragStart.x - 200 && midDrag.y === dragStart.y - 100 && midDrag.width === dragStart.width &&
    draggedSaved.normal.left === dragStart.x - 200 && draggedSaved.normal.top === dragStart.y - 100 &&
    otherBox.x === dragStart.x - 200 && otherBox.y === dragStart.y - 100 && otherBox.width === dragStart.width,
    { dragStart, midDrag, saved: draggedSaved.normal, otherBox });
  await other.close();

  await popup.close();
  return { pass: results.every(result => result.pass), results };
}
