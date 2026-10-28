import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64url, redirectUri, authUrl, formatTime, parsePlayer, SCOPES } from '../spotify.js';

test('base64url sem padding e sem + /', () => {
  assert.equal(base64url(new Uint8Array([251, 255, 191])), '-_-_');
  assert.equal(base64url(new Uint8Array([1])), 'AQ');
});

test('redirectUri ignora query e hash', () => {
  assert.equal(redirectUri({ origin: 'https://x.app', pathname: '/painel/' }), 'https://x.app/painel/');
});

test('authUrl leva PKCE e escopos', () => {
  const u = new URL(authUrl({ clientId: 'abc', redirect: 'https://x.app/', challenge: 'ch', state: 'st' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('client_id'), 'abc');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), 'ch');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://x.app/');
  assert.equal(u.searchParams.get('scope'), SCOPES.join(' '));
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65_400), '1:05');
  assert.equal(formatTime(undefined), '0:00');
});

test('parsePlayer com música', () => {
  const p = parsePlayer({
    is_playing: true,
    progress_ms: 1000,
    shuffle_state: true,
    device: { name: 'iPhone' },
    item: {
      type: 'track',
      name: 'Faixa',
      duration_ms: 200_000,
      artists: [{ name: 'A' }, { name: 'B' }],
      album: { name: 'Disco', images: [{ url: 'big.jpg' }, { url: 'small.jpg' }] },
    },
  });
  assert.deepEqual(p, {
    title: 'Faixa', artist: 'A, B', album: 'Disco', art: 'big.jpg',
    isPlaying: true, progress: 1000, duration: 200_000, shuffle: true, device: 'iPhone',
  });
});

test('parsePlayer com podcast e sem nada', () => {
  const p = parsePlayer({ is_playing: false, item: { type: 'episode', name: 'Ep', show: { name: 'Show', images: [{ url: 's.jpg' }] } } });
  assert.equal(p.artist, 'Show');
  assert.equal(p.art, 's.jpg');
  assert.equal(parsePlayer(null), null);
  assert.equal(parsePlayer({ item: null }), null);
});
