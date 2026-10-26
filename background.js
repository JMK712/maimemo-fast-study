importScripts('settings.js');

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'maimemo-study-ready') return;
  if (!sender.tab?.windowId) return;
  try {
    const frame = new URL(sender.url);
    if (frame.origin !== 'https://tc-apis.maimemo.com' || !frame.pathname.startsWith('/webstudy/app')) return;
  } catch {
    return;
  }

  (async () => {
    const stored = await chrome.storage.sync.get('settings');
    const settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
    if (!settings.enabled || !settings.browserFullscreen) return;
    const window = await chrome.windows.get(sender.tab.windowId);
    if (window.state !== 'fullscreen') {
      await chrome.windows.update(sender.tab.windowId, { state: 'fullscreen' });
    }
  })().catch(() => {});
});

let localSecret;
let wakePromise;
async function wakeLocalService() {
  if (!wakePromise) {
    wakePromise = chrome.runtime.sendNativeMessage('com.maimemo.faststudy.wake', { action: 'wake' })
      .then((response) => {
        if (response?.ok !== true) throw new Error('Local TTS wake failed');
      }).finally(() => { wakePromise = null; });
  }
  return wakePromise;
}
async function getLocalSecret() {
  if (localSecret) return localSecret;
  const response = await fetch(chrome.runtime.getURL('local-secret.json'));
  if (!response.ok) throw new Error('Local TTS is not installed');
  const config = await response.json();
  if (!/^[a-f0-9]{64}$/.test(config.token)) throw new Error('Invalid local TTS token');
  localSecret = config.token;
  return localSecret;
}

function cacheSettings(settings) {
  return {
    cacheEntries: settings.localTtsCacheEntries,
    cacheMinutes: settings.localTtsCacheMinutes,
    idleMinutes: settings.localTtsIdleMinutes
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'maimemo-local-tts-cache') return false;
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  (async () => {
    const stored = await chrome.storage.sync.get('settings');
    const settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
    const action = message.action;
    if (!['stats', 'clear', 'configure'].includes(action)) throw new Error('Invalid cache action');
    const response = await fetch('http://127.0.0.1:8765/v1/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MaiMemo-Token': await getLocalSecret() },
      body: JSON.stringify({ action, ...cacheSettings(settings) })
    });
    if (!response.ok) throw new Error(`Local TTS HTTP ${response.status}`);
    return { ok: true, ...await response.json() };
  })().then(sendResponse).catch((error) => {
    if (error instanceof TypeError) sendResponse({ ok: true, offline: true, entries: 0, bytes: 0 });
    else sendResponse({ ok: false, error: String(error) });
  });
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const prefetch = message?.type === 'maimemo-local-tts-prefetch';
  if (!prefetch && message?.type !== 'maimemo-local-tts') return false;
  (async () => {
    const source = new URL(sender.url);
    if (source.origin !== 'https://tc-apis.maimemo.com' ||
        !source.pathname.startsWith('/webstudy/app') || !sender.tab) {
      throw new Error('Request outside MaiMemo study');
    }
    const { text, voice, texts } = message;
    if ((prefetch
          ? !Array.isArray(texts) || texts.length < 1 || texts.length > 3 ||
            texts.some((item) => typeof item !== 'string' || !item.trim() || item.length > 600)
          : typeof text !== 'string' || !text.trim() || text.length > 600) ||
        !['af_heart', 'af_bella', 'af_sarah', 'am_michael'].includes(voice)) {
      throw new Error('Invalid speech request');
    }
    const rate = Number(message.rate) * Number(message.multiplier);
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) {
      throw new Error('Invalid rate');
    }
    const stored = await chrome.storage.sync.get('settings');
    const settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
    if (!settings.enabled || !settings.localTtsEnabled) throw new Error('Local TTS disabled');
    if (prefetch && !settings.localTtsPrefetch) throw new Error('Prefetch disabled');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const url = `http://127.0.0.1:8765/v1/${prefetch ? 'prefetch' : 'speech'}`;
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MaiMemo-Token': await getLocalSecret() },
        body: JSON.stringify({ ...(prefetch ? { texts, voice, rate } : { text, voice, rate }), ...cacheSettings(settings) }),
        signal: controller.signal
      };
      let response;
      try {
        response = await fetch(url, options);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        await wakeLocalService();
        response = await fetch(url, options);
      }
      if (!response.ok) throw new Error(`Local TTS HTTP ${response.status}`);
      const payload = await response.json();
      if (prefetch) return { ok: payload.queued === true };
      if (!payload.audio || typeof payload.audio !== 'string') throw new Error('Invalid audio response');
      return { ok: true, audio: payload.audio };
    } finally {
      clearTimeout(timer);
    }
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
