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
async function getLocalSecret() {
  if (localSecret) return localSecret;
  const response = await fetch(chrome.runtime.getURL('local-secret.json'));
  if (!response.ok) throw new Error('Local TTS is not installed');
  const config = await response.json();
  if (!/^[a-f0-9]{64}$/.test(config.token)) throw new Error('Invalid local TTS token');
  localSecret = config.token;
  return localSecret;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'maimemo-local-tts') return false;
  (async () => {
    const source = new URL(sender.url);
    if (source.origin !== 'https://tc-apis.maimemo.com' ||
        !source.pathname.startsWith('/webstudy/app') || !sender.tab) {
      throw new Error('Request outside MaiMemo study');
    }
    const { text, voice } = message;
    if (typeof text !== 'string' || !text.trim() || text.length > 600 ||
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch('http://127.0.0.1:8765/v1/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MaiMemo-Token': await getLocalSecret() },
        body: JSON.stringify({ text, voice, rate }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Local TTS HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.audio || typeof payload.audio !== 'string') throw new Error('Invalid audio response');
      return { ok: true, audio: payload.audio };
    } finally {
      clearTimeout(timer);
    }
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
