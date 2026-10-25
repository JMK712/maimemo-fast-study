(() => {
  'use strict';

  let settings = { ...MAIMEMO_DEFAULTS };
  let pending = false;
  let deadline = 0;
  let scheduled = false;
  const attempted = new WeakSet();

  function visible(element) {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  }

  function signButton() {
    return [...document.querySelectorAll('.finished-status .taroify-button')]
      .find((button) => {
        const core = button.querySelector('taro-button-core');
        const disabled = core?.getAttribute('disabled');
        return button.querySelector('.taroify-button__text')?.textContent.trim() === '签到' &&
          !button.classList.contains('taroify-button--disabled') &&
          (disabled === null || disabled === 'false') && visible(button);
      });
  }

  function resultDialog() {
    return [...document.querySelectorAll('.taro__modal')]
      .find((dialog) => visible(dialog) &&
        /^(签到成功|无法签到)/.test(dialog.querySelector('.taro-modal__text')?.textContent.trim() || ''));
  }

  function run() {
    if (!settings.enabled || !settings.autoSign) return;

    if (pending) {
      const dialog = resultDialog();
      const confirm = dialog?.querySelector('.taro-model__confirm');
      if (confirm && confirm.textContent.trim() === '确定' && visible(confirm)) {
        pending = false;
        confirm.click();
        return;
      }
      if (Date.now() < deadline) return;
      pending = false;
    }

    const button = signButton();
    if (!button || attempted.has(button)) return;
    attempted.add(button);
    pending = true;
    deadline = Date.now() + 30000;
    (button.querySelector('taro-button-core') || button).click();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      run();
    });
  }

  chrome.storage.sync.get('settings').then((stored) => {
    settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
    schedule();
  }).catch(schedule);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    settings = { ...MAIMEMO_DEFAULTS, ...changes.settings.newValue };
    if (!settings.enabled || !settings.autoSign) pending = false;
    schedule();
  });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'disabled']
  });
  schedule();
})();
