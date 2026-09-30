(() => {
  if (window !== window.top) return;

  const STORAGE_KEY = 'chatDungsil:watchTargets:chzzk';
  const LIMIT = 1000;
  const MESSAGE_TYPES = new Set(['getWatchState', 'setWatchTargets', 'setWatchEnabled', 'clearWatch', 'getWatchMessages']);
  let targets = [];
  let enabled = false;
  let messages = [];
  let revision = 0;
  let lastRows = [];
  let lastLog = null;
  let pageUrl = location.href;
  let stoppedReason = '';
  let scanTimer = null;
  let acceptFromEmpty = false;

  function findLog() {
    return document.querySelector('#aside-chatting [role="log"]') ||
      document.querySelector('[role="log"]');
  }

  function textWithEmoji(element) {
    let value = '';
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) value += node.textContent;
      else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG') value += node.getAttribute('alt') || '[이모티콘]';
        else for (const child of node.childNodes) visit(child);
      }
    }
    visit(element);
    return value.trim();
  }

  function readRow(row) {
    const content = row.querySelector('[class*="_chatting_message_"]') || row;
    const nickname = content.querySelector('button[class*="_nickname_"]') ||
      content.querySelector('span[class*="_nickname_"]');
    if (!nickname) return null;
    const spans = [...content.querySelectorAll('span[class*="_text_"]')].filter(span =>
      !nickname.contains(span) && !span.parentElement.closest('span[class*="_text_"]'));
    const body = spans.length ? spans.map(textWithEmoji).join('') :
      [...content.querySelectorAll('img')].filter(img => !nickname.contains(img))
        .map(img => img.getAttribute('alt') || '[이모티콘]').join('');
    if (!body) return null;
    const name = nickname.textContent.trim();
    return { node: row, top: row.getBoundingClientRect().top,
      signature: JSON.stringify([name, body]), nickname: name, text: body };
  }

  function readRows(log) {
    if (!log) return [];
    return [...log.querySelectorAll('[class*="_item_"]')].map(readRow).filter(Boolean)
      .sort((a, b) => a.top - b.top);
  }

  function overlap(previous, current, identity) {
    for (let size = Math.min(previous.length, current.length); size > 0; size--) {
      let matches = true;
      for (let i = 0; i < size; i++) {
        const before = previous[previous.length - size + i];
        const after = current[i];
        if (before.signature !== after.signature || (identity && before.node !== after.node)) {
          matches = false;
          break;
        }
      }
      if (matches) return size;
    }
    return 0;
  }

  function scan() {
    scanTimer = null;
    if (location.href !== pageUrl) {
      pageUrl = location.href;
      enabled = false;
      messages = [];
      revision++;
      lastLog = null;
      lastRows = [];
      stoppedReason = '방송 주소가 바뀌어 수집을 중지했습니다.';
    }
    const log = findLog();
    const rows = readRows(log);
    if (log !== lastLog) {
      lastLog = log;
      lastRows = rows;
      acceptFromEmpty = false;
      return;
    }
    if (!enabled) {
      lastRows = rows;
      return;
    }
    const shared = overlap(lastRows, rows, true) || overlap(lastRows, rows, false);
    if (shared || (acceptFromEmpty && !lastRows.length)) {
      for (const row of rows.slice(shared)) {
        if (!targets.includes(row.nickname)) continue;
        messages.push({ at: Date.now(), nickname: row.nickname, text: row.text });
        if (messages.length > LIMIT) messages.splice(0, messages.length - LIMIT);
        revision++;
      }
    }
    // 겹침 없는 전체 교체, 글자 변경, 과거 스크롤은 새 메시지로 단정하지 않는다.
    if (rows.length || lastRows.length) acceptFromEmpty = false;
    lastRows = rows;
  }

  function scheduleScan() {
    if (!enabled) return;
    if (scanTimer == null) scanTimer = setTimeout(scan, 0);
  }

  function state() {
    if (enabled || location.href !== pageUrl) scan();
    return { targets, enabled, available: !!findLog(), count: messages.length, revision, stoppedReason };
  }

  const targetsReady = new Promise(resolve => chrome.storage.local.get(STORAGE_KEY, result => {
    const saved = result[STORAGE_KEY];
    if (Array.isArray(saved)) targets = saved.filter(value => typeof value === 'string');
    resolve();
  }));

  new MutationObserver(scheduleScan).observe(document, { childList: true, characterData: true, subtree: true });
  setInterval(() => {
    if (location.href !== pageUrl || (enabled && findLog() !== lastLog)) scan();
  }, 500);

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!message || !MESSAGE_TYPES.has(message.type)) return;
    targetsReady.then(() => {
    if (message.type === 'getWatchState') {
      respond(state());
    } else if (message.type === 'setWatchTargets') {
      if (enabled) scan();
      const raw = Array.isArray(message.targets) ? message.targets :
        String(message.targets || '').split(/\r?\n/);
      targets = [...new Set(raw.map(value => String(value).trim()).filter(Boolean))];
      chrome.storage.local.set({ [STORAGE_KEY]: targets });
      if (!targets.length) enabled = false;
      lastLog = findLog();
      lastRows = readRows(lastLog);
      respond(state());
    } else if (message.type === 'setWatchEnabled') {
      enabled = !!message.value && targets.length > 0;
      stoppedReason = message.value && !targets.length ? '닉네임을 먼저 저장하세요.' : '';
      lastLog = findLog();
      lastRows = readRows(lastLog);
      acceptFromEmpty = enabled && !!lastLog && !lastRows.length;
      respond(state());
    } else if (message.type === 'clearWatch') {
      messages = [];
      revision++;
      respond(state());
    } else if (message.type === 'getWatchMessages') {
      const current = state();
      respond(message.sinceRevision === revision ? { ...current, unchanged: true } :
        { ...current, messages });
    }
    });
    return true;
  });
})();
