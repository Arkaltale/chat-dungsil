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
  page = await context.newPage();
  const extension = await context.newPage();
  await extension.goto(`chrome-extension://${extensionId}/popup.html`);
  await extension.evaluate(() => chrome.storage.local.clear());
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const append = (name, text) => page.evaluate(({ name, text }) => {
    const row = document.createElement('div');
    row.className = '_item_';
    const message = document.createElement('div');
    message.className = '_chatting_message_';
    const button = document.createElement('button');
    button.className = '_nickname_';
    button.textContent = name;
    const span = document.createElement('span');
    span.className = '_text_';
    span.textContent = text;
    message.append(button, span);
    row.append(message);
    document.querySelector('#log').append(row);
  }, { name, text });
  const getMessages = () => send({ type: 'getWatchMessages' });
  const send = msg => extension.evaluate(async message => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try { return await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 }); }
    catch { return null; }
  }, msg);
  const html = `<!doctype html><div id="aside-chatting"><div role="log" id="log">
    <div class="_item_"><div class="_chatting_message_"><button class="_nickname_"><span class="_text_">민수</span></button><span class="_text_">기존 메시지</span></div></div>
  </div></div>`;
  await context.route('https://chzzk.naver.com/__watch', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: html }));
  await page.goto('https://chzzk.naver.com/__watch');
  await page.bringToFront();
  await page.waitForTimeout(250);
  await send({ type: 'setWatchTargets', targets: ['민수'] });
  const started = await send({ type: 'setWatchEnabled', value: true });
  await page.evaluate(() => {
    const row = document.querySelector('#log ._item_').cloneNode(true);
    row.querySelectorAll('._text_')[1].textContent = '새 메시지';
    document.querySelector('#log').appendChild(row);
  });
  await page.waitForTimeout(150);
  const messages = await send({ type: 'getWatchMessages' });
  record('시작 전 행을 제외하고 새 대상 메시지만 수집', !!started?.enabled &&
    messages?.messages?.length === 1 && messages.messages[0].text === '새 메시지', { started, messages });

  await append('다른 사람', '제외');
  await append('민수', '반복');
  await append('민수', '반복');
  await page.waitForTimeout(100);
  let found = await getMessages();
  record('타인 제외와 동일 발언 연속 전송 구분', found?.messages?.length === 3 &&
    found.messages[1].text === '반복' && found.messages[2].text === '반복', found);

  await page.evaluate(() => {
    const log = document.querySelector('#log');
    log.replaceChildren(...[...log.children].map(row => row.cloneNode(true)));
  });
  await page.waitForTimeout(100);
  found = await getMessages();
  record('전체 행 복제 재렌더 중복 제외', found?.messages?.length === 3, found);

  await page.evaluate(() => {
    const log = document.querySelector('#log');
    log.firstElementChild.remove();
    log.firstElementChild.remove();
  });
  await append('민수', '가상 목록 새 행');
  await page.waitForTimeout(100);
  found = await getMessages();
  record('앞 행 제거 후 새 행 수집', found?.messages?.length === 4 &&
    found.messages[3].text === '가상 목록 새 행', found);

  await page.evaluate(() => {
    document.querySelector('#log').lastElementChild.querySelector('._text_').textContent = '행 내용 변경';
  });
  await page.waitForTimeout(100);
  found = await getMessages();
  record('기존 행 문장 변경을 새 메시지로 오인하지 않음', found?.messages?.length === 4, found);
  await append('민수', '변경 뒤 신규');
  await page.waitForTimeout(100);
  found = await getMessages();
  record('문장 변경 뒤 다음 새 행 수집', found?.messages?.length === 5, found);

  await page.evaluate(() => {
    const log = document.querySelector('#log');
    const row = log.lastElementChild.cloneNode(true);
    row.querySelector('._text_').textContent = '전체 교체 기준선';
    log.replaceChildren(row);
  });
  await page.waitForTimeout(100);
  found = await getMessages();
  record('겹침 없는 전체 교체는 기준선만 갱신', found?.messages?.length === 5, found);
  await append('민수', '교체 이후');
  await page.waitForTimeout(100);
  found = await getMessages();
  record('전체 교체 이후 신규 행 수집', found?.messages?.length === 6, found);

  await page.evaluate(() => {
    const oldLog = document.querySelector('#log');
    const replacement = oldLog.cloneNode(false);
    const row = oldLog.lastElementChild.cloneNode(true);
    row.querySelector('._text_').textContent = '새 로그의 기존 행';
    replacement.append(row);
    oldLog.replaceWith(replacement);
  });
  await page.waitForTimeout(100);
  found = await getMessages();
  record('채팅 로그 교체 시 기존 행 기준선 처리', found?.messages?.length === 6, found);
  await append('민수', '새 로그의 신규 행');
  await page.waitForTimeout(100);
  found = await getMessages();
  record('채팅 로그 교체 이후 신규 행 수집', found?.messages?.length === 7, found);

  await send({ type: 'clearWatch' });
  found = await getMessages();
  record('목록 비우기는 수집 기준선 유지', found?.messages?.length === 0, found);
  await page.evaluate(() => {
    const log = document.querySelector('#log');
    log.replaceChildren(...[...log.children].map(row => row.cloneNode(true)));
  });
  await page.waitForTimeout(100);
  found = await getMessages();
  record('목록 비운 뒤 기존 행 재수집 없음', found?.messages?.length === 0, found);

  await send({ type: 'setWatchEnabled', value: false });
  await append('민수', '정지 중');
  await page.waitForTimeout(100);
  await send({ type: 'setWatchEnabled', value: true });
  await append('민수', '재개 뒤');
  await page.waitForTimeout(100);
  found = await getMessages();
  record('정지·재개 시 기존 행 제외', found?.messages?.length === 1 &&
    found.messages[0].text === '재개 뒤', found);

  const emptyTargets = await send({ type: 'setWatchTargets', targets: [] });
  const emptyStart = await send({ type: 'setWatchEnabled', value: true });
  record('빈 대상 목록으로 수집 시작 방지', !emptyTargets?.enabled && !emptyStart?.enabled &&
    !!emptyStart?.stoppedReason, { emptyTargets, emptyStart });

  await page.evaluate(() => document.querySelector('#log').replaceChildren());
  await send({ type: 'setWatchTargets', targets: ['민수'] });
  await send({ type: 'setWatchEnabled', value: true });
  await append('민수', '빈 로그 첫 메시지');
  await page.waitForTimeout(100);
  found = await getMessages();
  record('빈 로그에서 첫 새 메시지 수집', found?.messages?.at(-1)?.text === '빈 로그 첫 메시지', found);

  await page.evaluate(() => history.pushState({}, '', '/__watch-other'));
  await page.waitForTimeout(600);
  found = await getMessages();
  record('방송 URL 변경 시 수집 중지와 메모리 초기화', !found?.enabled &&
    found?.messages?.length === 0 && !!found.stoppedReason, found);

  await send({ type: 'setWatchEnabled', value: true });
  await page.evaluate(() => {
    const row = document.createElement('div');
    row.className = '_item_';
    const content = document.createElement('div');
    content.className = '_chatting_message_';
    const name = document.createElement('button');
    name.className = '_nickname_';
    name.textContent = '민수';
    const body = document.createElement('span');
    body.className = '_text_';
    body.append('안녕 ', Object.assign(document.createElement('img'), { alt: '웃음' }),
      Object.assign(document.createElement('img'), { alt: '' }));
    content.append(name, body);
    row.append(content);
    document.querySelector('#log').append(row);
  });
  await page.waitForTimeout(100);
  found = await getMessages();
  record('이모티콘 alt와 빈 alt 대체 텍스트', found?.messages?.at(-1)?.text === '안녕 웃음[이모티콘]', found);
  const unchanged = await send({ type: 'getWatchMessages', sinceRevision: found.revision });
  record('변경 없는 조회는 목록 재전송 생략', unchanged?.unchanged === true && !('messages' in unchanged), unchanged);

  await page.evaluate(() => {
    const log = document.querySelector('#log');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 1005; i++) {
      const row = document.createElement('div');
      row.className = '_item_';
      const content = document.createElement('div');
      content.className = '_chatting_message_';
      const name = document.createElement('button');
      name.className = '_nickname_';
      name.textContent = '민수';
      const body = document.createElement('span');
      body.className = '_text_';
      body.textContent = '번호 ' + i;
      content.append(name, body);
      row.append(content);
      fragment.append(row);
    }
    log.append(fragment);
  });
  await page.waitForTimeout(300);
  found = await getMessages();
  record('최근 1000건 제한', found?.count === 1000 && found.messages?.length === 1000 &&
    found.messages[0].text === '번호 5' && found.messages.at(-1).text === '번호 1004',
    { count: found?.count, first: found?.messages?.[0], last: found?.messages?.at(-1) });

  await page.goto('https://chzzk.naver.com/__watch');
  await page.bringToFront();
  await page.waitForTimeout(250);
  const afterReload = await send({ type: 'getWatchMessages' });
  record('새 문서는 대상만 유지하고 수집·목록 초기화', !afterReload?.enabled &&
    afterReload?.count === 0 && afterReload?.targets?.includes('민수'), afterReload);

  await page.evaluate(() => document.querySelector('#log').remove());
  await send({ type: 'setWatchEnabled', value: true });
  await page.evaluate(() => {
    const log = document.createElement('div');
    log.id = 'log';
    log.setAttribute('role', 'log');
    log.innerHTML = '<div class="_item_"><div class="_chatting_message_"><button class="_nickname_">민수</button><span class="_text_">늦게 생긴 로그의 기존 행</span></div></div>';
    document.querySelector('#aside-chatting').append(log);
  });
  await page.waitForTimeout(100);
  const lateLog = await getMessages();
  record('늦게 생긴 로그의 기존 행 제외', lateLog?.count === 0, lateLog);
  await append('민수', '<img src=x onerror=alert(1)>');
  await page.waitForTimeout(100);
  await page.bringToFront();
  await extension.reload();
  await page.bringToFront();
  await page.waitForTimeout(150);
  await extension.locator('#watchSection summary').click();
  await extension.locator('#watchTargets').fill('민수\n지수\n민수');
  await page.waitForTimeout(1200);
  const draft = await extension.locator('#watchTargets').inputValue();
  record('팝업 폴링이 입력 중 대상 편집을 덮지 않음', draft === '민수\n지수\n민수', draft);
  await extension.locator('#watchSave').click();
  await page.bringToFront();
  const savedTargets = await send({ type: 'getWatchState' });
  const storedTargets = await extension.evaluate(() => chrome.storage.local.get('chatDungsil:watchTargets:chzzk'));
  record('대상 닉네임만 별도 키에 중복 없이 저장',
    JSON.stringify(savedTargets?.targets) === JSON.stringify(['민수', '지수']) &&
    JSON.stringify(storedTargets['chatDungsil:watchTargets:chzzk']) === JSON.stringify(['민수', '지수']),
    { savedTargets, storedTargets });

  await extension.locator('#watchOpen').click();
  await page.waitForTimeout(500);
  const viewer = context.pages().find(tab => tab.url().includes('/watch.html?tabId='));
  const viewerText = viewer && await viewer.locator('.message .text').allTextContents();
  const viewerImages = viewer && await viewer.locator('.message img').count();
  record('별도 창은 채팅 HTML을 텍스트로 표시', !!viewer && viewerText?.includes('<img src=x onerror=alert(1)>') &&
    viewerImages === 0, { viewerText, viewerImages });
  const originalRow = await viewer.locator('.message').elementHandle();
  await viewer.waitForTimeout(900);
  record('새 메시지 없으면 목록 DOM 유지', await originalRow.evaluate(row => row.isConnected), null);
  await extension.evaluate(() => chrome.storage.local.set({ 'chatDungsil:chzzk': { fontSize: 20 } }));
  await viewer.waitForTimeout(100);
  const viewerFont = await viewer.locator('#messages').evaluate(el => getComputedStyle(el).fontSize);
  record('기존 치지직 글자 크기 설정을 별도 창에 적용', viewerFont === '20px', viewerFont);
  await extension.locator('#watchOpen').click();
  await page.waitForTimeout(150);
  const viewerCount = context.pages().filter(tab => tab.url().includes('/watch.html?tabId=')).length;
  record('같은 원본 탭 모아보기 창 재사용', viewerCount === 1, viewerCount);

  const pipState = () => viewer.evaluate(() => {
    const pip = documentPictureInPicture.window;
    return {
      open: !!pip && !pip.closed,
      pipRows: pip?.document.querySelectorAll('#messages .message').length ?? null,
      pipHeader: !!pip?.document.querySelector('header #pip'),
      pipBackground: pip ? pip.getComputedStyle(pip.document.body).backgroundColor : null,
      mainHasList: !!document.querySelector('body > #messages'),
      order: [...document.body.children].map(el => el.id || el.tagName.toLowerCase()).join(','),
      notice: document.querySelector('#pipNotice').hidden ? '' : document.querySelector('#pipNotice').textContent,
      button: (document.querySelector('#pip') || pip?.document.querySelector('#pip'))?.textContent,
    };
  });
  await viewer.bringToFront();
  await viewer.locator('#pip').click();
  await viewer.waitForTimeout(300);
  let watchPip = await pipState();
  record('모아보기 PiP로 목록·컨트롤 이동과 스타일 적용', watchPip.open && watchPip.pipRows === 1 &&
    watchPip.pipHeader && watchPip.pipBackground === 'rgb(20, 21, 23)' && !watchPip.mainHasList &&
    watchPip.notice.includes('PiP'), watchPip);
  await append('민수', 'PiP 중 새 메시지');
  await viewer.waitForTimeout(950);
  watchPip = await pipState();
  record('모아보기 PiP에서 새 메시지 갱신', watchPip.pipRows === 2, watchPip);
  await viewer.evaluate(() => documentPictureInPicture.window.document.querySelector('#pip').click());
  await viewer.waitForTimeout(300);
  watchPip = await pipState();
  record('PiP 안 되돌리기 버튼으로 원래 창 복원', !watchPip.open && watchPip.mainHasList &&
    watchPip.order.startsWith('header,messages,pipNotice,footer') && !watchPip.notice &&
    watchPip.button === '항상 위(PiP)' && await viewer.locator('.message').count() === 2, watchPip);

  await viewer.locator('#pip').click();
  await viewer.waitForTimeout(300);
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = '__otherPip';
    button.onclick = () => documentPictureInPicture.requestWindow({ width: 200, height: 200 });
    document.body.append(button);
  });
  await page.bringToFront();
  await page.locator('#__otherPip').click();
  await viewer.waitForTimeout(300);
  watchPip = await pipState();
  const otherPipOpen = await page.evaluate(() => !!documentPictureInPicture.window);
  record('다른 PiP가 열려 모아보기 PiP가 닫히면 원래 창 복원', otherPipOpen && !watchPip.open &&
    watchPip.mainHasList && !watchPip.notice, { otherPipOpen, watchPip });
  await page.evaluate(() => { documentPictureInPicture.window?.close(); document.querySelector('#__otherPip').remove(); });

  await viewer.locator('#autoScroll').uncheck();
  await viewer.locator('#messages').evaluate(el => {
    el.style.flex = 'none';
    el.style.height = '24px';
    el.scrollTop = 0;
  });
  await append('민수', '스크롤 위치 확인');
  await viewer.waitForTimeout(950);
  const scrollState = await viewer.locator('#messages').evaluate(el => ({
    top: el.scrollTop, height: el.scrollHeight, viewport: el.clientHeight,
  }));
  record('자동 스크롤 OFF 뒤 새 메시지에도 스크롤 위치 유지',
    scrollState.height > scrollState.viewport && scrollState.top === 0 &&
    await viewer.locator('.message').count() === 3, scrollState);
  await viewer.locator('#clear').click();
  await page.waitForTimeout(150);
  record('별도 창 자동 스크롤 토글과 목록 비우기', !await viewer.locator('#autoScroll').isChecked() &&
    await viewer.locator('.message').count() === 0, await viewer.locator('#status').textContent());

  await page.close();
  await viewer.waitForTimeout(200);
  const closedState = { status: await viewer.locator('#status').textContent(), rows: await viewer.locator('.message').count() };
  record('원본 탭 닫힘 시 표시 비우고 종료 안내', closedState.status.includes('원본 탭이 닫혔') &&
    closedState.rows === 0, closedState);
  await viewer.close();

  const reverse = await context.newPage();
  const reverseHtml = `<!doctype html><style>
    #log{display:flex;flex-direction:column-reverse;width:300px;height:96px}
    ._item_{height:32px;flex:none}
  </style><div id="aside-chatting"><div role="log" id="log">
    <div class="_item_"><div class="_chatting_message_"><button class="_nickname_">민수</button><span class="_text_">기존 2</span></div></div>
    <div class="_item_"><div class="_chatting_message_"><button class="_nickname_">민수</button><span class="_text_">기존 1</span></div></div>
  </div></div>`;
  await context.route('https://chzzk.naver.com/__watch-reverse', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: reverseHtml }));
  await reverse.goto('https://chzzk.naver.com/__watch-reverse');
  await reverse.bringToFront();
  await reverse.waitForTimeout(250);
  await send({ type: 'setWatchEnabled', value: true });
  const reversePositions = await reverse.evaluate(() =>
    [...document.querySelectorAll('#log ._item_')].map(row => row.getBoundingClientRect().top));
  await reverse.evaluate(() => {
    const log = document.querySelector('#log');
    const row = log.firstElementChild.cloneNode(true);
    row.querySelector('._text_').textContent = '신규 1';
    log.prepend(row);
  });
  await reverse.waitForTimeout(100);
  let reverseMessages = await send({ type: 'getWatchMessages' });
  record('화면 역순 로그의 첫 신규 행 수집', reversePositions[0] > reversePositions[1] &&
    reverseMessages?.messages?.length === 1 && reverseMessages.messages[0].text === '신규 1',
    { reversePositions, reverseMessages });
  await reverse.evaluate(() => {
    const log = document.querySelector('#log');
    const row = log.firstElementChild.cloneNode(true);
    row.querySelector('._text_').textContent = '신규 2';
    log.prepend(row);
    log.lastElementChild.remove();
  });
  await reverse.waitForTimeout(100);
  reverseMessages = await send({ type: 'getWatchMessages' });
  record('역순 로그에서 오래된 행 제거 후 신규 행 수집', reverseMessages?.messages?.length === 2 &&
    reverseMessages.messages[1].text === '신규 2', reverseMessages);
  await reverse.close();

  const youtube = await context.newPage();
  await context.route('https://www.youtube.com/__watch', route =>
    route.fulfill({ contentType: 'text/html;charset=utf-8', body: '<!doctype html><div>유튜브</div>' }));
  await youtube.goto('https://www.youtube.com/__watch');
  await youtube.bringToFront();
  await youtube.waitForTimeout(250);
  const unsupported = await send({ type: 'getWatchState' });
  const ytPopup = await context.newPage();
  await ytPopup.goto(`chrome-extension://${extensionId}/popup.html`);
  await youtube.bringToFront();
  await ytPopup.reload();
  await youtube.bringToFront();
  await youtube.waitForTimeout(1100);
  const ytWatchHidden = await ytPopup.locator('#watchSection').evaluate(el => el.hidden);
  record('유튜브에서 수집 기능 비노출', !unsupported &&
    ytWatchHidden, { unsupported, ytWatchHidden });
  await ytPopup.close();
  await youtube.close();
  await extension.close();
  return { pass: results.every(result => result.pass), results };
}
