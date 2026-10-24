(() => {
  'use strict';

  let enabled = true;
  let attached = false;
  let attempts = 0;
  document.addEventListener('maimemo-tts-config', (event) => {
    enabled = event.detail?.prefetch === true;
  });

  async function attach() {
    if (attached || ++attempts > 100) return;
    const resource = performance.getEntriesByType('resource')
      .find((entry) => /^https:\/\/tc-apis\.maimemo\.com\/webstudy\/app\/js\/common\.[\w-]+\.js$/.test(entry.name));
    if (!resource) return;
    try {
      const module = await import(resource.name);
      const exported = Object.values(module);
      const serviceClass = exported.find((value) => typeof value === 'function' &&
        value.prototype?.getWord && value.prototype?.submitResponse);
      const speechClass = exported.find((value) => typeof value === 'function' &&
        value.prototype?.getSettings && value.prototype?.speakText);
      if (!serviceClass || !speechClass) return;
      const service = serviceClass.instance;

      function prefetch(card) {
        try {
          if (!enabled || !Array.isArray(card?.phrases)) return;
          const texts = card.phrases.slice(0, 3).map((phrase) => phrase?.phrase)
            .filter((text) => typeof text === 'string' && text.trim() && text.length <= 600);
          if (!texts.length) return;
          const rate = Number(speechClass.instance.getSettings().enRate) || 1;
          document.dispatchEvent(new CustomEvent('maimemo-tts-prefetch', {
            detail: { texts, rate }
          }));
        } catch {
          // Prefetch must never affect MaiMemo's own card loading.
        }
      }

      const getWord = service.getWord;
      service.getWord = async function (...args) {
        const card = await getWord.apply(this, args);
        prefetch(card);
        return card;
      };
      const submitResponse = service.submitResponse;
      service.submitResponse = async function (...args) {
        const result = await submitResponse.apply(this, args);
        prefetch(result?.next);
        return result;
      };
      attached = true;
    } catch {
      // A site update may change its modules. Ordinary on-demand speech still works.
    }
  }

  const timer = setInterval(() => {
    void attach();
    if (attached || attempts >= 100) clearInterval(timer);
  }, 300);
})();
