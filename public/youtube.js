// YouTube: busca pela YouTube Data API v3 e player pela IFrame Player API.
// A chave fica no código (é pública no navegador); proteja-a no Google Cloud
// restringindo a "YouTube Data API v3" e aos endereços do painel.
export const API_KEY = 'AIzaSyDq4W8OmlGv8UUud3jLU0Y_ZKEw9ser5s0';

const API = 'https://www.googleapis.com/youtube/v3';

/* Funções puras (testadas em tests/youtube.test.mjs) */

// Aceita link de vídeo, Shorts, live, youtu.be ou só o ID. Retorna { video, list } ou null.
export function parseYouTube(input) {
  const s = String(input ?? '').trim();
  if (/^[\w-]{11}$/.test(s)) return { video: s, list: null };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;
  const list = url.searchParams.get('list');
  let video = null;
  if (host === 'youtu.be') video = url.pathname.slice(1, 12);
  else if (url.pathname === '/watch') video = url.searchParams.get('v');
  else video = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})/)?.[1] ?? null;
  if (video && !/^[\w-]{11}$/.test(video)) video = null;
  return video || list ? { video, list } : null;
}

// "PT1H2M3S" → "1:02:03"; "PT4M5S" → "4:05". Ao vivo ("P0D") → "AO VIVO".
export function formatDuration(iso) {
  const m = String(iso ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return '';
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x) || 0);
  const hours = d * 24 + h;
  if (!hours && !min && !s) return 'AO VIVO';
  const ss = String(s).padStart(2, '0');
  return hours ? `${hours}:${String(min).padStart(2, '0')}:${ss}` : `${min}:${ss}`;
}

// A API devolve títulos com entidades HTML (&quot;, &#39;...).
export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function toVideo(item) {
  const sn = item.snippet ?? {};
  return {
    id: typeof item.id === 'string' ? item.id : item.id?.videoId,
    title: decodeEntities(sn.title),
    channel: decodeEntities(sn.channelTitle),
    thumb: sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? '',
    live: sn.liveBroadcastContent === 'live',
    duration: '',
  };
}

/* API */

export class YouTubeError extends Error {
  constructor(message, reason) {
    super(message);
    this.reason = reason;
  }
}

async function api(path, params, signal) {
  if (!API_KEY) throw new YouTubeError('Busca sem chave da API', 'noKey');
  const q = new URLSearchParams({ ...params, key: API_KEY });
  const res = await fetch(`${API}/${path}?${q}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason ?? data.error?.status ?? '';
    throw new YouTubeError(data.error?.message || `Erro ${res.status}`, reason);
  }
  return data;
}

// Busca vídeos que podem tocar fora do YouTube e completa com a duração (1 unidade extra).
export async function search(query, signal) {
  const data = await api('search', {
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '15',
    regionCode: 'BR',
    relevanceLanguage: 'pt',
    q: query,
  }, signal);
  const videos = (data.items ?? []).map(toVideo).filter((v) => v.id);
  if (!videos.length) return videos;
  try {
    const details = await api('videos', { part: 'contentDetails', id: videos.map((v) => v.id).join(',') }, signal);
    const byId = new Map((details.items ?? []).map((i) => [i.id, i.contentDetails?.duration]));
    for (const v of videos) v.duration = v.live ? 'AO VIVO' : formatDuration(byId.get(v.id));
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // Sem duração ainda dá para tocar.
  }
  return videos;
}

/* Player (IFrame Player API) */

let apiReady;
export function loadPlayerApi() {
  apiReady ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      apiReady = null;
      reject(new YouTubeError('Não foi possível carregar o player do YouTube', 'offline'));
    };
    document.head.append(s);
  });
  return apiReady;
}

// Códigos de erro do player → mensagem.
export function playerErrorMessage(code) {
  if (code === 101 || code === 150 || code === 153) return 'O dono deste vídeo não permite tocar fora do YouTube';
  if (code === 100) return 'Vídeo removido ou privado';
  if (code === 2) return 'Link de vídeo inválido';
  return 'O YouTube não conseguiu tocar este vídeo';
}
