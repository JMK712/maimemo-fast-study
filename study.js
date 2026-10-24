(() => {
  'use strict';

  let settings = { ...MAIMEMO_DEFAULTS };
  let settingsLoaded = false;
  let clicked = false;
  let fullscreenRequested = false;

  function run() {
    if (!settingsLoaded || !settings.enabled) return;
    const notice = document.body?.innerText.includes('我已阅读测试须知');
    if (notice && settings.autoStart && !clicked) {
      const checkbox = document.querySelector('input[type="checkbox"].index__native-checkbox');
      const button = [...document.querySelectorAll('button')]
        .find((element) => element.textContent.trim() === '开始学习');
      if (checkbox && button?.isConnected) {
        if (!checkbox.checked) checkbox.click();
        if (checkbox.checked) {
          clicked = true;
          button.click();
        }
      }
      return;
    }

    if (!notice && settings.browserFullscreen && !fullscreenRequested &&
        document.readyState !== 'loading' && document.body?.innerText.trim()) {
      fullscreenRequested = true;
      chrome.runtime.sendMessage({ type: 'maimemo-study-ready' }).catch(() => {
        fullscreenRequested = false;
      });
    }
  }

  chrome.storage.sync.get('settings').then((stored) => {
    settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
    settingsLoaded = true;
    run();
  }).catch(() => {
    settingsLoaded = true;
    run();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      settings = { ...MAIMEMO_DEFAULTS, ...changes.settings.newValue };
      run();
    }
  });
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('readystatechange', run);
})();
