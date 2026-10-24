(() => {
  'use strict';

  const originalSpeak = SpeechSynthesis.prototype.speak;
  const originalCancel = SpeechSynthesis.prototype.cancel;
  const pending = new Map();
  let enabled = true;
  let counter = 0;

  function finish(record, type) {
    if (record.done) return;
    record.done = true;
    clearTimeout(record.timer);
    pending.delete(record.id);
    record.utterance.dispatchEvent(new Event(type));
  }

  document.addEventListener('maimemo-tts-config', (event) => {
    enabled = event.detail?.enabled === true;
  });

  document.addEventListener('maimemo-tts-response', (event) => {
    const { id, audio } = event.detail || {};
    const record = pending.get(id);
    if (!record || record.done) return;
    clearTimeout(record.timer);
    if (!audio) {
      pending.delete(id);
      record.done = true;
      originalSpeak.call(window.speechSynthesis, record.utterance);
      return;
    }
    const player = new Audio(`data:audio/wav;base64,${audio}`);
    record.player = player;
    player.onended = () => finish(record, 'end');
    player.onerror = () => {
      pending.delete(id);
      record.done = true;
      originalSpeak.call(window.speechSynthesis, record.utterance);
    };
    player.play().then(() => {
      if (!record.done) record.utterance.dispatchEvent(new Event('start'));
    }).catch(() => {
      pending.delete(id);
      record.done = true;
      originalSpeak.call(window.speechSynthesis, record.utterance);
    });
  });

  SpeechSynthesis.prototype.speak = function (utterance) {
    if (!enabled || !utterance || typeof utterance.text !== 'string' ||
        !utterance.text.trim() || utterance.text.length > 600 ||
        (utterance.lang && !/^en(?:-|$)/i.test(utterance.lang))) {
      return originalSpeak.call(this, utterance);
    }
    const id = `${Date.now()}-${++counter}`;
    const record = { id, utterance, player: null, done: false, timer: null };
    record.timer = setTimeout(() => {
      if (record.done) return;
      pending.delete(id);
      record.done = true;
      originalSpeak.call(window.speechSynthesis, utterance);
    }, 20000);
    pending.set(id, record);
    document.dispatchEvent(new CustomEvent('maimemo-tts-request', {
      detail: { id, text: utterance.text, rate: Number(utterance.rate) || 1 }
    }));
  };

  SpeechSynthesis.prototype.cancel = function () {
    for (const record of pending.values()) {
      record.player?.pause();
      finish(record, 'error');
    }
    return originalCancel.call(this);
  };
})();
