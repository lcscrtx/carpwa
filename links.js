// Monta os links que abrem os apps nativos do iPhone.
// Esquemas customizados (waze://, spotify:) abrem o app direto, inclusive a partir do PWA instalado.

export const NAV_APPS = {
  waze: { name: 'Waze', url: (q) => `waze://?q=${encodeURIComponent(q)}&navigate=yes`, home: 'waze://' },
  apple: { name: 'Apple Mapas', url: (q) => `maps://?daddr=${encodeURIComponent(q)}&dirflg=d`, home: 'maps://' },
  google: {
    name: 'Google Maps',
    url: (q) => `comgooglemaps://?daddr=${encodeURIComponent(q)}&directionsmode=driving`,
    home: 'comgooglemaps://',
  },
};

export const MUSIC_APPS = {
  apple: { name: 'Apple Music', url: 'music://' },
  spotify: { name: 'Spotify', url: 'spotify:' },
  youtube: { name: 'YouTube Music', url: 'youtubemusic://' },
  deezer: { name: 'Deezer', url: 'deezer://' },
};

export function navUrl(app, destination) {
  const nav = NAV_APPS[app] ?? NAV_APPS.waze;
  const q = String(destination ?? '').trim();
  return q ? nav.url(q) : nav.home;
}

export function musicUrl(app) {
  return (MUSIC_APPS[app] ?? MUSIC_APPS.apple).url;
}

// Mantém só dígitos e um "+" inicial; retorna '' se não sobrar número.
export function cleanPhone(raw) {
  const s = String(raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return (s.startsWith('+') ? '+' : '') + digits;
}

export function telUrl(raw) {
  const n = cleanPhone(raw);
  return n ? `tel:${n}` : '';
}

export function smsUrl(raw) {
  const n = cleanPhone(raw);
  return n ? `sms:${n}` : '';
}

// coords.speed vem em m/s e pode ser null ou negativo quando o GPS não sabe.
export function toKmh(metersPerSecond) {
  if (typeof metersPerSecond !== 'number' || !Number.isFinite(metersPerSecond) || metersPerSecond < 0) return null;
  return Math.round(metersPerSecond * 3.6);
}

// Lista de recentes sem repetição (ignora maiúsculas), mais novo primeiro.
export function pushRecent(list, item, max = 5) {
  const value = String(item ?? '').trim();
  if (!value) return list.slice(0, max);
  const key = value.toLowerCase();
  return [value, ...list.filter((x) => x.toLowerCase() !== key)].slice(0, max);
}
