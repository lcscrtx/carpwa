// Localização, clima e mapa: funções puras + chamadas sem chave (Open-Meteo e Waze).

// Centro padrão quando ainda não há GPS (Praça da Sé, São Paulo).
export const DEFAULT_POS = { lat: -23.5505, lon: -46.6333 };

// Distância em metros entre dois pontos (haversine).
export function distanceM(a, b) {
  const R = 6371e3;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Mapa ao vivo do Waze (sem chave). O card não recebe toques: arrastar troca de página.
export function wazeMapUrl({ lat, lon }, zoom = 15) {
  return `https://embed.waze.com/iframe?zoom=${zoom}&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&pin=1`;
}

// Códigos WMO do Open-Meteo → texto curto e emoji.
const WEATHER = [
  [[0], 'Céu limpo', '☀️', '🌙'],
  [[1, 2], 'Poucas nuvens', '🌤️', '☁️'],
  [[3], 'Nublado', '☁️', '☁️'],
  [[45, 48], 'Neblina', '🌫️', '🌫️'],
  [[51, 53, 55, 56, 57], 'Garoa', '🌦️', '🌧️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Chuva', '🌧️', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Neve', '❄️', '❄️'],
  [[95, 96, 99], 'Tempestade', '⛈️', '⛈️'],
];

export function describeWeather(code, isDay = true) {
  const row = WEATHER.find(([codes]) => codes.includes(code));
  if (!row) return { label: '', icon: '' };
  return { label: row[1], icon: isDay ? row[2] : row[3] };
}

export function parseWeather(data) {
  const c = data?.current;
  if (!c || typeof c.temperature_2m !== 'number') return null;
  const { label, icon } = describeWeather(c.weather_code, c.is_day !== 0);
  return {
    temp: Math.round(c.temperature_2m),
    max: Math.round(data.daily?.temperature_2m_max?.[0] ?? c.temperature_2m),
    min: Math.round(data.daily?.temperature_2m_min?.[0] ?? c.temperature_2m),
    label,
    icon,
  };
}

export async function fetchWeather({ lat, lon }) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) throw new Error(`Clima: erro ${res.status}`);
  return parseWeather(await res.json());
}

// "há 5 min", "há 2 h", "há 3 dias"
export function timeAgo(ms, now = Date.now()) {
  const min = Math.max(0, Math.round((now - ms) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

// Rota a pé até o carro no Apple Mapas (o Waze só faz rota de carro).
export function walkUrl({ lat, lon }) {
  return `maps://?daddr=${lat},${lon}&dirflg=w`;
}
