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
