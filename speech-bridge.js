(() => {
  'use strict';
  let settings = { enabled: true, localTtsEnabled: true, localTtsPrefetch: true, localTtsVoice: 'af_heart', localTtsSpeed: 1 };

  function publishConfig() {
    document.dispatchEvent(new CustomEvent('maimemo-tts-config', {
      detail: {
        enabled: Boolean(settings.enabled && settings.localTtsEnabled),
        prefetch: Boolean(settings.enabled && settings.localTtsEnabled && settings.localTtsPrefetch)
      }
    }));
  }

  chrome.storage.sync.get('settings').then((stored) => {
    settings = { ...settings, ...stored.settings };
    publishConfig();
  }).catch(publishConfig);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
      publishConfig();
    }
  });

  document.addEventListener('maimemo-tts-request', (event) => {
    const { id, text, rate } = event.detail || {};
    if (typeof id !== 'string' || typeof text !== 'string') return;
    if (!settings.enabled || !settings.localTtsEnabled) {
      document.dispatchEvent(new CustomEvent('maimemo-tts-response', { detail: { id } }));
      return;
    }
    chrome.runtime.sendMessage({
      type: 'maimemo-local-tts', text, rate,
      voice: settings.localTtsVoice,
      multiplier: settings.localTtsSpeed
    }).then((response) => {
      document.dispatchEvent(new CustomEvent('maimemo-tts-response', {
        detail: { id, audio: response?.ok ? response.audio : null }
      }));
    }).catch(() => {
      document.dispatchEvent(new CustomEvent('maimemo-tts-response', { detail: { id } }));
    });
  });

  document.addEventListener('maimemo-tts-prefetch', (event) => {
    if (!settings.enabled || !settings.localTtsEnabled || !settings.localTtsPrefetch) return;
    const { texts, rate } = event.detail || {};
    if (!Array.isArray(texts) || texts.length > 3 || !texts.length) return;
    chrome.runtime.sendMessage({
      type: 'maimemo-local-tts-prefetch', texts, rate,
      voice: settings.localTtsVoice,
      multiplier: settings.localTtsSpeed
    }).catch(() => {});
  });
})();
