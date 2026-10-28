import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, tileXY, tileUrl, mapTiles, describeWeather, parseWeather, timeAgo, walkUrl } from '../public/place.js';

test('distanceM', () => {
  assert.equal(Math.round(distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })), 0);
  const d = distanceM({ lat: -23.5505, lon: -46.6333 }, { lat: -23.5614, lon: -46.6559 }); // Sé → Paulista
  assert.ok(d > 2400 && d < 2700, String(d));
});

test('tileXY e tileUrl', () => {
  const { x, y } = tileXY({ lat: 0, lon: 0 }, 1);
  assert.equal(x, 1);
  assert.ok(Math.abs(y - 1) < 1e-9);
  assert.equal(tileUrl(0, 0, 0), 'https://tile.openstreetmap.org/0/0/0.png');
  assert.equal(tileUrl(-1, 0, 1), 'https://tile.openstreetmap.org/1/1/0.png');
});

test('mapTiles cobre a área toda', () => {
  const tiles = mapTiles({ lat: -23.5505, lon: -46.6333 }, 15, 400, 200);
  assert.ok(tiles.length >= 2 && tiles.length <= 9);
  for (const t of tiles) assert.match(t.url, /openstreetmap\.org\/15\//);
  assert.ok(tiles.some((t) => t.left <= 0 && t.top <= 0));
  assert.ok(tiles.some((t) => t.left + 256 >= 400 && t.top + 256 >= 200));
});

test('describeWeather', () => {
  assert.deepEqual(describeWeather(0, true), { label: 'Céu limpo', icon: '☀️' });
  assert.deepEqual(describeWeather(0, false), { label: 'Céu limpo', icon: '🌙' });
  assert.equal(describeWeather(63).label, 'Chuva');
  assert.deepEqual(describeWeather(999), { label: '', icon: '' });
});

test('parseWeather', () => {
  const w = parseWeather({
    current: { temperature_2m: 23.6, weather_code: 3, is_day: 1 },
    daily: { temperature_2m_max: [27.2], temperature_2m_min: [17.8] },
  });
  assert.deepEqual(w, { temp: 24, max: 27, min: 18, label: 'Nublado', icon: '☁️' });
  assert.equal(parseWeather({}), null);
});

test('timeAgo', () => {
  const now = 1_000_000_000;
  assert.equal(timeAgo(now - 20_000, now), 'agora');
  assert.equal(timeAgo(now - 5 * 60000, now), 'há 5 min');
  assert.equal(timeAgo(now - 2 * 3600000, now), 'há 2 h');
  assert.equal(timeAgo(now - 3 * 86400000, now), 'há 3 dias');
});

test('walkUrl', () => {
  assert.equal(walkUrl({ lat: -23.5, lon: -46.6 }), 'maps://?daddr=-23.5,-46.6&dirflg=w');
});
