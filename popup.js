const controls = [...document.querySelectorAll('[data-setting]')];
const status = document.querySelector('#status');
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

chrome.storage.sync.get('settings').then((stored) => {
  settings = { ...MAIMEMO_DEFAULTS, ...stored.settings };
  render();
});

for (const control of controls) {
  control.addEventListener('change', async () => {
    settings[control.dataset.setting] = control.type === 'checkbox'
      ? control.checked : Number(control.value);
    render();
    try { await save(); } catch { status.textContent = '保存失败，请重试'; }
  });
}

document.querySelector('#reset').addEventListener('click', async () => {
  settings = { ...MAIMEMO_DEFAULTS };
  render();
  try { await save(); } catch { status.textContent = '保存失败，请重试'; }
});

document.querySelector('#openStudy').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.maimemo.com/home/web_study' });
});
