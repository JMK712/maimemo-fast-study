const controls = [...document.querySelectorAll('[data-setting]')];
const status = document.querySelector('#status');
const cacheStatus = document.querySelector('#cacheStatus');
let settings = { ...MAIMEMO_DEFAULTS };

function render() {
  for (const control of controls) {
    const value = settings[control.dataset.setting];
    if (control.type === 'checkbox') control.checked = Boolean(value);
    else control.value = String(value);
    control.disabled = control.dataset.setting !== 'enabled' && !settings.enabled;
  }
}

render();

async function save() {
  await chrome.storage.sync.set({ settings });
  status.textContent = '已保存';
}

async function updateCache(action = 'stats') {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'maimemo-local-tts-cache', action });
    if (!result?.ok) throw new Error(result?.error || 'Cache request failed');
    cacheStatus.textContent = result.offline
      ? '服务未运行，缓存为空'
      : `已缓存 ${result.entries} 条，约 ${(result.bytes / 1048576).toFixed(1)} MB`;
  } catch {
    cacheStatus.textContent = '缓存状态不可用';
  }
}

chrome.storage.sync.get('settings').then((stored) => {
  settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
  render();
  updateCache();
});

for (const control of controls) {
  control.addEventListener('change', async () => {
    settings[control.dataset.setting] = control.type === 'checkbox'
      ? control.checked : control.dataset.setting === 'localTtsVoice'
        ? control.value : Number(control.value);
    render();
    try {
      await save();
      if (/^localTts(Cache|Idle)/.test(control.dataset.setting)) await updateCache('configure');
    } catch { status.textContent = '保存失败，请重试'; }
  });
}

document.querySelector('#reset').addEventListener('click', async () => {
  settings = { ...MAIMEMO_DEFAULTS };
  render();
  try { await save(); await updateCache('configure'); } catch { status.textContent = '保存失败，请重试'; }
});

document.querySelector('#clearCache').addEventListener('click', () => updateCache('clear'));

document.querySelector('#openStudy').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.maimemo.com/home/web_study' });
});
