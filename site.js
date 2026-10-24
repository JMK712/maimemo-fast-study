(() => {
  'use strict';

  const STUDY_PATH = '/home/web_study';
  const REDIRECT_KEY = 'maimemo-fast-study-login';
  const REDIRECT_TTL_MS = 2 * 60 * 1000;
  const isStudy = location.pathname === STUDY_PATH;
  let settings = { ...MAIMEMO_DEFAULTS };
  let settingsLoaded = false;
  let submitted = false;
  let lastCredentials = '';
  let credentialsSince = 0;

  function hasSession() {
    return Boolean(document.querySelector('a[href="/auth/logout"], a[href$="/auth/logout"]'));
  }

  function maybeRedirectAfterLogin() {
    const started = Number(sessionStorage.getItem(REDIRECT_KEY));
    if (!started) return;
    if (!settings.enabled || !settings.returnAfterLogin) {
      sessionStorage.removeItem(REDIRECT_KEY);
      return;
    }
    if (Date.now() - started > REDIRECT_TTL_MS) {
      sessionStorage.removeItem(REDIRECT_KEY);
      return;
    }
    if (isStudy) {
      sessionStorage.removeItem(REDIRECT_KEY);
    } else if (hasSession()) {
      sessionStorage.removeItem(REDIRECT_KEY);
      location.replace(STUDY_PATH);
    }
  }

  function fillViewport() {
    if (!isStudy) return;
    if (!settings.enabled || !settings.fillPage) {
      document.getElementById('maimemo-fast-study-style')?.remove();
      return;
    }
    const frame = [...document.querySelectorAll('iframe')].find((element) => {
      try {
        const url = new URL(element.src);
        return url.hostname === 'tc-apis.maimemo.com' && url.pathname.startsWith('/webstudy/app');
      } catch {
        return false;
      }
    });
    if (!frame) return;

    if (!document.getElementById('maimemo-fast-study-style')) {
      const style = document.createElement('style');
      style.id = 'maimemo-fast-study-style';
      style.textContent = `
        html, body { width: 100% !important; height: 100% !important; margin: 0 !important; overflow: hidden !important; }
        body > .navbar, body > .footer-border { display: none !important; }
        iframe[src^="https://tc-apis.maimemo.com/webstudy/app"] {
          position: fixed !important; inset: 0 !important;
          width: 100vw !important; height: 100vh !important; height: 100dvh !important;
          max-width: none !important; max-height: none !important;
          margin: 0 !important; padding: 0 !important; border: 0 !important;
          z-index: 2147483647 !important; display: block !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function maybeSubmitSavedLogin() {
    if (!settingsLoaded || !isStudy || submitted || !settings.enabled || !settings.autoLogin) return;
    const form = document.querySelector('#login form.denglu, #login form.form');
    const identity = form?.querySelector('input[type="email"], input[autocomplete="username"]');
    const password = form?.querySelector('input[type="password"]');
    const button = form?.querySelector('#loginBtn, button[type="submit"]');
    if (!identity || !password || !button) return;

    identity.autocomplete = 'username';
    password.autocomplete = 'current-password';
    const credentials = `${identity.value.length}:${password.value.length}`;
    if (!identity.value.trim() || !password.value || !button.isConnected || button.disabled) {
      lastCredentials = '';
      credentialsSince = 0;
      return;
    }
    if (credentials !== lastCredentials) {
      lastCredentials = credentials;
      credentialsSince = Date.now();
      return;
    }
    if (Date.now() - credentialsSince < settings.settleMs) return;

    submitted = true;
    if (settings.returnAfterLogin) {
      sessionStorage.setItem(REDIRECT_KEY, String(Date.now()));
      const redirect = document.querySelector('#redirect');
      if (redirect) redirect.value = encodeURIComponent(location.origin + STUDY_PATH);
    }
    button.click();
  }

  function update() {
    if (!settingsLoaded) return;
    maybeRedirectAfterLogin();
    fillViewport();
    maybeSubmitSavedLogin();
  }

  function start() {
    chrome.storage.sync.get('settings').then((stored) => {
      settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
      settingsLoaded = true;
      update();
    }).catch(() => {
      settingsLoaded = true;
      update();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) {
        settings = { ...MAIMEMO_DEFAULTS, ...changes.settings.newValue };
        update();
      }
    });
    new MutationObserver(update).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['value', 'disabled', 'src']
    });
    document.addEventListener('input', maybeSubmitSavedLogin, true);
    document.addEventListener('change', maybeSubmitSavedLogin, true);
    // Chrome autofill can change input.value without dispatching an input event.
    const timer = setInterval(() => {
      update();
      if (submitted || (isStudy && hasSession())) clearInterval(timer);
    }, 150);
    setTimeout(() => clearInterval(timer), 30_000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
