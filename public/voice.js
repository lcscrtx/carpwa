// Voz: reconhecimento de fala do próprio navegador (no iPhone é o ditado da Siri).
// Não precisa de chave nem servidor; exige o Ditado ativado no iPhone.

const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;

export const voiceSupported = Boolean(Recognition);

export function voiceErrorMessage(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microfone ou ditado bloqueado. No iPhone: Ajustes → Geral → Teclado → Ativar Ditado, e permita o microfone';
  }
  if (code === 'no-speech') return 'Não ouvi nada. Toque no microfone e fale';
  if (code === 'audio-capture') return 'Nenhum microfone disponível';
  if (code === 'network') return 'O reconhecimento de voz precisa de internet';
  if (code === 'unsupported') return 'Este navegador não reconhece voz';
  return 'Não consegui entender. Tente de novo';
}

// Escuta uma frase. onPartial recebe o texto enquanto a pessoa fala.
// Retorna { done: Promise<string>, stop() }; a promise rejeita com Error(code).
export function listen({ lang = 'pt-BR', onPartial } = {}) {
  if (!Recognition) {
    return { done: Promise.reject(new Error('unsupported')), stop() {} };
  }
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let text = '';
  let failed = null;
  const done = new Promise((resolve, reject) => {
    rec.onresult = (e) => {
      text = Array.from(e.results, (r) => r[0].transcript).join('').trim();
      onPartial?.(text);
    };
    rec.onerror = (e) => {
      // "aborted" vem do stop() manual: não é erro.
      if (e.error !== 'aborted') failed = e.error;
    };
    rec.onend = () => {
      if (text) resolve(text);
      else reject(new Error(failed ?? 'no-speech'));
    };
  });
  try {
    rec.start();
  } catch {
    return { done: Promise.reject(new Error('not-allowed')), stop() {} };
  }
  return { done, stop: () => rec.stop() };
}
