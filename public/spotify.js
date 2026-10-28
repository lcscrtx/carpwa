// Spotify Web API: login com Authorization Code + PKCE (sem segredo no app) e
// controle do player que estiver tocando (o app do Spotify no iPhone, por exemplo).
// Os controles de reprodução exigem conta Premium.

// App "Painel do Carro" no painel de desenvolvedor do Spotify. Client ID é público no PKCE.
export const CLIENT_ID = '9b4f06cdf17f48d08a9b01f9f3562599';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const TOKEN_KEY = 'carpwa:spotify';
const VERIFIER_KEY = 'carpwa:spotify-pkce';
export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
];

/* Funções puras (testadas em tests/spotify.test.mjs) */

export function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// URI cadastrada no painel do Spotify: o endereço do app, sem hash nem query.
// O Spotify não aceita "localhost"; em desenvolvimento use http://127.0.0.1:PORTA/.
export function redirectUri(loc) {
  return loc.origin + loc.pathname;
}

export function authUrl({ clientId, redirect, challenge, state }) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: redirect,
    state,
  });
  return `${AUTH_URL}?${q}`;
}

export function formatTime(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Resume a resposta de GET /me/player no que a tela precisa. null = nada tocando.
export function parsePlayer(data) {
  const item = data?.item;
  if (!item) return null;
  const isEpisode = item.type === 'episode';
  const images = (isEpisode ? item.images ?? item.show?.images : item.album?.images) ?? [];
  return {
    title: item.name ?? '',
    artist: isEpisode ? item.show?.name ?? '' : (item.artists ?? []).map((a) => a.name).join(', '),
    album: isEpisode ? '' : item.album?.name ?? '',
    art: images[0]?.url ?? '',
    isPlaying: Boolean(data.is_playing),
    progress: data.progress_ms ?? 0,
    duration: item.duration_ms ?? 0,
    shuffle: Boolean(data.shuffle_state),
    device: data.device?.name ?? '',
  };
}

/* Tokens */

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeTokens(t) {
  if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  else localStorage.removeItem(TOKEN_KEY);
}

export function isConnected() {
  return Boolean(readTokens()?.refresh);
}

export function disconnect() {
  writeTokens(null);
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SpotifyError(data.error_description || data.error || `Erro ${res.status}`, res.status);
  const prev = readTokens();
  const tokens = {
    clientId: params.client_id,
    access: data.access_token,
    refresh: data.refresh_token ?? prev?.refresh,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  writeTokens(tokens);
  return tokens;
}

export class SpotifyError extends Error {
  constructor(message, status, reason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/* Login */

export async function login(clientId = CLIENT_ID) {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(48));
  const verifier = base64url(verifierBytes);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = base64url(crypto.getRandomValues(new Uint8Array(12)));
  localStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state, clientId }));
  location.href = authUrl({ clientId, redirect: redirectUri(location), challenge, state });
}

// Chamar ao abrir o app. Retorna 'ok', 'error:<msg>' ou null se não for retorno do login.
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;

  const pending = JSON.parse(localStorage.getItem(VERIFIER_KEY) || 'null');
  localStorage.removeItem(VERIFIER_KEY);
  history.replaceState(null, '', redirectUri(location) + location.hash);

  if (error) return `error:${error === 'access_denied' ? 'Acesso negado' : error}`;
  if (!pending || pending.state !== params.get('state')) {
    return 'error:Login não reconhecido. Tente conectar de novo pelo app instalado.';
  }
  try {
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(location),
      client_id: pending.clientId,
      code_verifier: pending.verifier,
    });
    return 'ok';
  } catch (e) {
    return `error:${e.message}`;
  }
}

async function accessToken() {
  const t = readTokens();
  if (!t?.refresh) throw new SpotifyError('Spotify não conectado', 401);
  if (t.access && Date.now() < t.expires - 60_000) return t.access;
  try {
    return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: t.clientId })).access;
  } catch (e) {
    // Refresh revogado ou inválido: precisa entrar de novo.
    if (e.status === 400 || e.status === 401) writeTokens(null);
    throw e;
  }
}

/* API */

async function api(path, { method = 'GET', body } = {}, retry = true) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    const t = readTokens();
    if (t) writeTokens({ ...t, expires: 0 });
    return api(path, { method, body }, false);
  }
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new SpotifyError(err.message || `Erro ${res.status}`, res.status, err.reason);
  }
  return data;
}

export const getPlayer = async () => parsePlayer(await api('/me/player?additional_types=episode'));
export const getDevices = async () => (await api('/me/player/devices'))?.devices ?? [];
export const getPlaylists = async () => (await api('/me/playlists?limit=30'))?.items?.filter(Boolean) ?? [];
export const pause = () => api('/me/player/pause', { method: 'PUT' });
export const next = () => api('/me/player/next', { method: 'POST' });
export const previous = () => api('/me/player/previous', { method: 'POST' });
export const setShuffle = (on) => api(`/me/player/shuffle?state=${on}`, { method: 'PUT' });

// Toca (ou retoma). Sem aparelho ativo, tenta acordar o primeiro disponível.
export async function play(body) {
  try {
    return await api('/me/player/play', { method: 'PUT', body });
  } catch (e) {
    if (e.status !== 404) throw e;
    const devices = await getDevices();
    const target = devices.find((d) => d.type === 'Smartphone') ?? devices[0];
    if (!target) throw new SpotifyError('Nenhum aparelho com Spotify aberto', 404, 'NO_ACTIVE_DEVICE');
    return api(`/me/player/play?device_id=${encodeURIComponent(target.id)}`, { method: 'PUT', body });
  }
}
