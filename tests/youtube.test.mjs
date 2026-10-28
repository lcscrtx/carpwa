import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTube, formatDuration, decodeEntities, toVideo, playerErrorMessage } from '../public/youtube.js';

test('parseYouTube entende os formatos de link', () => {
  const v = 'dQw4w9WgXcQ';
  assert.deepEqual(parseYouTube(`https://www.youtube.com/watch?v=${v}`), { video: v, list: null });
  assert.deepEqual(parseYouTube(`youtu.be/${v}?si=abc`), { video: v, list: null });
  assert.deepEqual(parseYouTube(`https://youtube.com/shorts/${v}`), { video: v, list: null });
  assert.deepEqual(parseYouTube(`https://m.youtube.com/live/${v}`), { video: v, list: null });
  assert.deepEqual(parseYouTube(`https://music.youtube.com/watch?v=${v}&list=PL1`), { video: v, list: 'PL1' });
  assert.deepEqual(parseYouTube('https://www.youtube.com/playlist?list=PLabc'), { video: null, list: 'PLabc' });
  assert.deepEqual(parseYouTube(v), { video: v, list: null });
});

test('parseYouTube recusa o que não é YouTube', () => {
  assert.equal(parseYouTube('rock anos 80'), null);
  assert.equal(parseYouTube('https://vimeo.com/123'), null);
  assert.equal(parseYouTube('https://youtube.com/@canal'), null);
  assert.equal(parseYouTube(''), null);
});

test('formatDuration', () => {
  assert.equal(formatDuration('PT4M5S'), '4:05');
  assert.equal(formatDuration('PT1H2M3S'), '1:02:03');
  assert.equal(formatDuration('PT45S'), '0:45');
  assert.equal(formatDuration('P0D'), 'AO VIVO');
  assert.equal(formatDuration('P1DT2H'), '26:00:00');
  assert.equal(formatDuration(undefined), '');
});

test('decodeEntities', () => {
  assert.equal(decodeEntities('Rock &amp; Roll &quot;ao vivo&quot; &#39;99'), `Rock & Roll "ao vivo" '99`);
});

test('toVideo resume item da busca', () => {
  const v = toVideo({
    id: { videoId: 'abcdefghijk' },
    snippet: { title: 'A &amp; B', channelTitle: 'Canal', liveBroadcastContent: 'none', thumbnails: { medium: { url: 'm.jpg' } } },
  });
  assert.deepEqual(v, { id: 'abcdefghijk', title: 'A & B', channel: 'Canal', thumb: 'm.jpg', live: false, duration: '' });
});

test('playerErrorMessage', () => {
  assert.match(playerErrorMessage(150), /não permite/);
  assert.match(playerErrorMessage(100), /removido/);
});
