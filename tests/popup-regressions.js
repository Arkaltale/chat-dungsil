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
  const popup = await page.context().newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const results = await popup.evaluate(async () => {
    const results = [];
    const check = (name, pass) => results.push({ name, pass });
    const status = document.getElementById('status');
    const version = document.getElementById('version');
    const toggle = document.getElementById('toggle');
    const hide = document.getElementById('hide');
    const lock = document.getElementById('locked');
    const theater = document.getElementById('autoTheater');
    render(null);
    check('미연결 페이지 안내 및 제어 비활성화', toggle.disabled && status.textContent.includes('치지직·유튜브'));
    render({ floating: true, opacity: 1 });
    check('버전 없는 이전 런타임 안내', toggle.disabled && status.textContent.includes('이전 코드'));
    render({ version: '3.1.1', floating: true, opacity: 1 });
    check('버전 불일치 안내', toggle.disabled && version.textContent.includes('설치 1.0.0 · 페이지 3.1.1'));
    let st = { version: '1.0.0', floating: true, opacity: 0.6, mode: 'theater', chatFound: true, hidden: false, locked: false, autoTheater: false };
    render(st);
    check('현재 버전과 T 모드 표시', !toggle.disabled && status.textContent.includes('T 모드') && document.getElementById('opv').textContent === '60%');
    const messages = [];
    send = async msg => {
      if (msg.type === 'getStatus') return st;
      messages.push(msg);
      if (msg.type === 'setHidden') st.hidden = msg.value;
      if (msg.type === 'setLocked') st.locked = msg.value;
      if (msg.type === 'setAutoTheater') st.autoTheater = msg.value;
      return st;
    };
    const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
    hide.click(); await flush();
    check('숨기기 버튼 및 다시 표시 안내', messages.at(-1).type === 'setHidden' && messages.at(-1).value && hide.textContent === '채팅 다시 표시');
    hide.click(); await flush();
    check('다시 표시 메시지', messages.at(-1).value === false && hide.textContent === '채팅 잠시 숨기기');
    lock.click(); await flush();
    check('이동 잠금 메시지', messages.at(-1).type === 'setLocked' && messages.at(-1).value === true);
    theater.click(); await flush();
    check('자동 T 옵션 메시지', messages.at(-1).type === 'setAutoTheater' && messages.at(-1).value === true);
    render({ version: '1.0.0', popupChat: true, supportsChatAppearance: true, fontSize: 18, hideChatBanner: true });
    const floatingControls = document.getElementById('floatingControls');
    check('치지직 채팅 팝업 창 전용 모드', floatingControls.hidden && document.getElementById('keys').hidden &&
      status.textContent.includes('채팅 팝업 창') && !document.getElementById('fontSize').disabled &&
      document.getElementById('fontSizeValue').textContent === '18px' && !document.getElementById('chatAppearance').hidden &&
      document.getElementById('hideChatBanner').checked && !document.getElementById('hideChatBanner').disabled);
    render({ version: '1.0.0', popupChat: true, site: 'youtube', supportsChatAppearance: false, fontSize: null });
    check('유튜브 채팅 팝아웃 창 전용 모드', floatingControls.hidden && status.textContent.includes('유튜브 채팅 팝아웃 창') &&
      !document.getElementById('fontSize').disabled && document.getElementById('chatAppearance').hidden);
    const help = document.getElementById('help');
    const keys = document.getElementById('keys');
    render({ version: '1.0.0', popupChat: true, supportsChatAppearance: true, fontSize: null });
    check('사용 안내는 전용 모드에서도 보이고 단축키만 숨김', help.tagName === 'DETAILS' && !help.hidden &&
      help.querySelector('summary').textContent === '사용 안내' && help.contains(keys) && keys.hidden &&
      help.textContent.includes('외부 PiP') && help.textContent.includes('모아보기'));
    render(st);
    check('일반 페이지로 돌아오면 플로팅 제어 다시 표시', !floatingControls.hidden && !document.getElementById('keys').hidden);
    st.floating = false; st.chatFound = false; render(st);
    check('채팅 미탐지 상태와 숨기기 비활성화', hide.disabled && status.textContent.includes('기다리는 중'));
    check('일반 페이지에서 사용 안내 안에 단축키 표시', !help.hidden && help.contains(keys) && !keys.hidden);
    return results;
  });
  // 모아보기 첫 사용 확인: 동의 키가 없을 때 → 확인 → 다시 열었을 때.
  const watchUi = () => popup.evaluate(async () => {
    const watchState = { targets: ['민수'], enabled: false, count: 0, available: true };
    send = async msg => msg.type === 'getWatchState' ? watchState : null;
    await refreshWatch();
    const $ = id => document.getElementById(id);
    return {
      section: !$('watchSection').hidden,
      consent: !$('watchConsent').hidden,
      consentText: $('watchConsent').textContent,
      disabled: ['watchTargets', 'watchSave', 'watchToggle', 'watchOpen'].map(id => $(id).disabled),
      note: !!document.querySelector('#watchSection .watchNote'),
      stored: (await chrome.storage.local.get('chatDungsil:watchConsent'))['chatDungsil:watchConsent'],
    };
  });
  await popup.evaluate(() => chrome.storage.local.remove('chatDungsil:watchConsent'));
  await popup.reload();
  await popup.waitForTimeout(300);
  const before = await watchUi();
  results.push({ name: '동의 전 모아보기 안내 표시와 컨트롤 비활성화', pass: before.section && before.consent &&
    before.disabled.every(Boolean) && before.consentText.includes('chrome.storage.local') &&
    before.consentText.includes('1,000건') && before.consentText.includes('외부 서버') &&
    before.consentText.includes('확인하고 사용하기') && before.stored === undefined, detail: before });
  await popup.locator('#watchSection summary').click();
  await popup.locator('#watchConsentAccept').click();
  await popup.waitForTimeout(100);
  const accepted = await watchUi();
  results.push({ name: '확인 후 컨트롤 활성화와 동의 키 저장', pass: accepted.section && !accepted.consent &&
    accepted.disabled.every(value => !value) && accepted.stored === true, detail: accepted });
  await popup.reload();
  await popup.waitForTimeout(300);
  const reopened = await watchUi();
  results.push({ name: '동의 후 다시 열면 안내 미표시', pass: reopened.section && !reopened.consent &&
    reopened.disabled.every(value => !value) && reopened.note, detail: reopened });
  await popup.evaluate(() => chrome.storage.local.remove('chatDungsil:watchConsent'));
  await popup.close();
  return { pass: results.every(r => r.pass), results };
}
