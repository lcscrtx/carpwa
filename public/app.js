import { NAV_APPS, MUSIC_APPS, navUrl, musicUrl, telUrl, smsUrl, toKmh, pushRecent } from './links.js';
import * as sp from './spotify.js';
import { initSquircles } from './squircle.js';
import { initYouTube } from './youtube-ui.js';
import { voiceSupported, listen, voiceErrorMessage } from './voice.js';
import { DEFAULT_POS, distanceM, mapTiles, fetchWeather, timeAgo, walkUrl } from './place.js';
import { parseCommand, findContact } from './assistant.js';

const KEY = 'carpwa:v1';
const CONTACT_SLOTS = 4;
const GAUGE_MAX = 200;
const GAUGE_ARC = 395.8; // 270° de um círculo de raio 84
const defaults = {
  navApp: 'waze',
  musicApp: 'apple',
  home: '',
  work: '',
  contacts: [],
  recents: [],
  gps: false,
  awake: false,
};

const $ = (id) => document.getElementById(id);
let state = load();

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Não foi possível salvar neste navegador');
  }
}

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function open(url) {
  if (url) location.href = url;
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase() || '#';
}

/* Telas: #home e #home2 (apps), #dash (painel), #music (Spotify), #youtube, #speed (velocímetro) */
const VIEWS = ['home', 'home2', 'dash', 'music', 'youtube', 'speed'];
let youtube = null; // controle da tela do YouTube (youtube-ui.js)
function currentView() {
  const v = location.hash.slice(1);
  if (v === 'home2' && !pages().includes('home2')) return 'home';
  return VIEWS.includes(v) ? v : 'home';
}

/* Painel e Apps ficam lado a lado no #pager; arrastar troca de página.
   A 2ª página de apps só existe com algum app extra ligado em Ajustes. */
const pager = $('pager');

function pages() {
  return state.extraApps?.length ? ['dash', 'home', 'home2'] : ['dash', 'home'];
}

function pageIndex() {
  return Math.round(pager.scrollLeft / (pager.clientWidth || 1));
}

function renderDots(i = pageIndex()) {
  const dots = $('dots');
  while (dots.children.length < pages().length) dots.append(document.createElement('i'));
  while (dots.children.length > pages().length) dots.lastChild.remove();
  [...dots.children].forEach((dot, n) => dot.classList.toggle('on', n === i));
}

function scrollToPage(v, behavior) {
  pager.scrollTo({ left: pages().indexOf(v) * pager.clientWidth, behavior });
  renderDots(pages().indexOf(v));
}

// Ao terminar o arrasto, a página visível vira a tela atual (sem empilhar histórico).
let scrollTimer;
pager.addEventListener('scroll', () => {
  renderDots();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const v = pages()[pageIndex()];
    if (v && v !== currentView()) {
      history.replaceState(null, '', `#${v}`);
      showView({ fromScroll: true });
    }
  }, 120);
}, { passive: true });

// Girar o celular muda a largura da página: reencaixa na atual.
window.addEventListener('resize', () => {
  if (!pager.hidden) scrollToPage(currentView(), 'instant');
});

function showView({ fromScroll = false } = {}) {
  const v = currentView();
  const paged = pages().includes(v);
  const wasPaged = !pager.hidden;
  pager.hidden = !paged;
  $('dots').hidden = !paged;
  $('view-home2').hidden = !pages().includes('home2');
  for (const name of VIEWS) if (!['dash', 'home', 'home2'].includes(name)) $(`view-${name}`).hidden = name !== v;
  // Entre Painel e Apps desliza; vindo de outra tela, já aparece no lugar.
  if (paged && !fromScroll) scrollToPage(v, wasPaged ? 'smooth' : 'instant');
  // O botão da direita alterna entre a grade de apps e o painel.
  const target = v === 'home' || v === 'home2' ? 'dash' : 'home';
  const btn = $('home-btn');
  btn.innerHTML = `<svg><use href="#i-${target === 'dash' ? 'dash' : 'grid'}"/></svg>`;
  btn.setAttribute('aria-label', target === 'dash' ? 'Painel' : 'Apps');
  btn.dataset.target = target;
  spSchedule();
  if (v === 'youtube' || v === 'dash') youtube?.show(v);
  else youtube?.hide();
}

function goView(v) {
  if (currentView() !== v) location.hash = v;
}

window.addEventListener('hashchange', () => showView());
$('home-btn').addEventListener('click', (e) => goView(e.currentTarget.dataset.target));

/* Relógio */
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
function tick() {
  const now = new Date();
  const time = timeFmt.format(now);
  $('clock').textContent = time;
  $('dash-time').textContent = time;
  $('dash-date').textContent = dateFmt.format(now);
  setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}

/* Apps extras (2ª página): abrem o app nativo pelo esquema de URL */
const EXTRA_APPS = [
  { id: 'whatsapp', name: 'WhatsApp', url: 'whatsapp://', icon: 'whatsapp' },
  { id: 'uber', name: 'Uber', url: 'uber://', icon: 'uber' },
  { id: '99', name: '99', url: 'taxis99://', text: '99', color: 'c-yellow' },
  { id: 'ifood', name: 'iFood', url: 'ifood://', text: 'iFood', color: 'c-red' },
  { id: 'instagram', name: 'Instagram', url: 'instagram://', icon: 'instagram' },
];

function renderExtras() {
  const grid = $('extra-apps');
  grid.replaceChildren();
  for (const app of EXTRA_APPS.filter((a) => state.extraApps?.includes(a.id))) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'app';
    b.dataset.url = app.url;
    b.innerHTML = '<span class="ico"></span><span class="name"></span>';
    const ico = b.firstChild;
    if (app.icon) {
      ico.style.setProperty('--ico-img', `url("icons/apps/${app.icon}.png")`);
      ico.classList.add('has-img');
    } else {
      ico.classList.add(app.color, 'ico-text');
      ico.classList.toggle('long', app.text.length > 3);
      ico.textContent = app.text;
    }
    b.lastChild.textContent = app.name;
    grid.append(b);
  }
}

/* Ícones reais dos apps, em icons/apps/<nome>.png */
const NAV_ICONS = { waze: 'waze', apple: 'maps', google: 'gmaps' };
const MUSIC_ICONS = { apple: 'music', spotify: 'spotify', youtube: 'ytmusic', deezer: 'deezer' };

function renderIcons() {
  const icons = {
    nav: NAV_ICONS[state.navApp] ?? 'waze',
    music: sp.isConnected() ? 'spotify' : MUSIC_ICONS[state.musicApp] ?? 'music',
    phone: 'phone',
    messages: 'messages',
    home: 'home',
    settings: 'settings',
    youtube: 'youtube',
  };
  for (const el of document.querySelectorAll('[data-icon]')) {
    el.style.setProperty('--ico-img', `url("icons/apps/${icons[el.dataset.icon]}.png")`);
    el.classList.add('has-img');
  }
}

/* Textos que dependem dos ajustes */
function render() {
  renderIcons();
  $('nav-app-name').textContent = NAV_APPS[state.navApp]?.name ?? 'Waze';
  $('music-app-name').textContent = sp.isConnected() ? 'Spotify' : MUSIC_APPS[state.musicApp]?.name ?? 'Música';
  const connected = sp.isConnected();
  for (const el of document.querySelectorAll('[data-sp-connected]')) el.hidden = !connected;
  for (const el of document.querySelectorAll('[data-sp-disconnected]')) el.hidden = connected;
  renderMusicCard();
  $('home-label').textContent = state.home || 'Definir';
  $('work-label').textContent = state.work || 'Definir';

  const faves = $('faves');
  faves.replaceChildren();
  const valid = state.contacts.filter((c) => telUrl(c.phone));
  for (const c of valid) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fave';
    b.innerHTML = `<span class="avatar"></span><span></span>`;
    b.children[0].textContent = initials(c.name || c.phone);
    b.children[1].textContent = c.name || c.phone;
    b.setAttribute('aria-label', `Ligar para ${c.name || c.phone}`);
    b.onclick = () => open(telUrl(c.phone));
    faves.append(b);
  }
  if (!valid.length) faves.innerHTML = '<p class="empty">Adicione contatos em Ajustes.</p>';
}

/* Navegação */
function go(destination) {
  state.recents = pushRecent(state.recents, destination);
  save();
  open(navUrl(state.navApp, destination));
}

function openNav() {
  const list = $('recent-list');
  list.replaceChildren();
  for (const r of state.recents) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row-btn';
    b.innerHTML = '<span class="ico sm c-blue"><svg><use href="#i-nav"/></svg></span><span></span>';
    b.lastChild.textContent = r;
    b.onclick = () => { $('nav-sheet').close(); go(r); };
    li.append(b);
    list.append(li);
  }
  $('nav-input').value = '';
  $('nav-sheet').showModal();
}

$('nav-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('nav-input').value.trim();
  if (!q) return;
  $('nav-sheet').close();
  go(q);
});

function goSaved(field) {
  const address = state[field];
  if (address) return open(navUrl(state.navApp, address));
  openSettings(field);
  toast(field === 'home' ? 'Defina o endereço de casa' : 'Defina o endereço do trabalho');
}

/* Telefone e Mensagens: mesma lista de favoritos, ação diferente */
function openContacts(mode) {
  const valid = state.contacts.filter((c) => telUrl(c.phone));
  if (!valid.length) {
    openSettings('contacts');
    toast('Adicione um contato favorito');
    return;
  }
  const toUrl = mode === 'sms' ? smsUrl : telUrl;
  $('contacts-title').textContent = mode === 'sms' ? 'Mensagens' : 'Telefone';
  const list = $('contact-list');
  list.replaceChildren();
  for (const c of valid) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row-btn';
    b.innerHTML = `<span class="avatar"></span><span></span><span class="ico sm c-green"><svg><use href="#i-${mode === 'sms' ? 'msg' : 'phone'}"/></svg></span>`;
    b.children[0].textContent = initials(c.name || c.phone);
    b.children[1].textContent = c.name || c.phone;
    b.onclick = () => open(toUrl(c.phone));
    li.append(b);
    list.append(li);
  }
  $('contacts-sheet').showModal();
}

/* Ajustes */
function openSettings(focus) {
  const form = $('settings-form');
  form.navApp.value = state.navApp;
  form.musicApp.value = state.musicApp;
  form.home.value = state.home;
  form.work.value = state.work;

  const box = $('contact-fields');
  box.replaceChildren();
  for (let i = 0; i < CONTACT_SLOTS; i++) {
    const c = state.contacts[i] ?? {};
    const pair = document.createElement('div');
    pair.className = 'pair';
    pair.innerHTML = `
      <input name="cname${i}" type="text" autocomplete="off" placeholder="Nome" aria-label="Nome do contato ${i + 1}">
      <input name="cphone${i}" type="tel" autocomplete="off" placeholder="Telefone" aria-label="Telefone do contato ${i + 1}">`;
    pair.children[0].value = c.name ?? '';
    pair.children[1].value = c.phone ?? '';
    box.append(pair);
  }

  renderSpotifySettings();

  const extras = $('extra-fields');
  extras.replaceChildren();
  for (const app of EXTRA_APPS) {
    const row = document.createElement('label');
    row.className = 'switch-row';
    row.innerHTML = '<span></span><input type="checkbox" class="switch">';
    row.firstChild.textContent = app.name;
    row.lastChild.name = `extra-${app.id}`;
    row.lastChild.checked = Boolean(state.extraApps?.includes(app.id));
    extras.append(row);
  }

  $('install-note').textContent = isStandalone()
    ? 'Instalado na Tela de Início.'
    : 'Para tela cheia no iPhone: no Safari, toque em Compartilhar → Adicionar à Tela de Início.';

  $('settings-sheet').showModal();
  const target = { home: form.home, work: form.work, contacts: form.cname0 }[focus];
  target?.focus();
}

function renderSpotifySettings() {
  const on = sp.isConnected();
  $('sp-status').textContent = on ? 'Conectado' : 'Desconectado';
  $('sp-status').classList.toggle('ok', on);
  $('sp-connect').textContent = on ? 'Desconectar' : 'Conectar';
}

async function spConnect() {
  // O Spotify só aceita voltar para HTTPS (ou 127.0.0.1), e o PKCE precisa de crypto.subtle.
  if (!window.isSecureContext) return toast('Conectar o Spotify exige o endereço HTTPS do painel');
  try {
    await sp.login();
  } catch {
    toast('Não foi possível abrir o login do Spotify');
  }
}

$('sp-connect').addEventListener('click', () => {
  if (!sp.isConnected()) return spConnect();
  sp.disconnect();
  spPlayer = null;
  renderSpotifySettings();
  render();
  renderPlayer();
  toast('Spotify desconectado');
});

$('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const contacts = [];
  for (let i = 0; i < CONTACT_SLOTS; i++) {
    const name = f[`cname${i}`].value.trim();
    const phone = f[`cphone${i}`].value.trim();
    if (name || phone) contacts.push({ name, phone });
  }
  const bad = contacts.find((c) => !telUrl(c.phone));
  if (bad) return toast(`Telefone inválido para ${bad.name || 'contato'}`);

  Object.assign(state, {
    navApp: f.navApp.value,
    musicApp: f.musicApp.value,
    home: f.home.value.trim(),
    work: f.work.value.trim(),
    contacts,
    extraApps: EXTRA_APPS.filter((a) => f[`extra-${a.id}`].checked).map((a) => a.id),
  });
  save();
  render();
  renderExtras();
  showView();
  $('settings-sheet').close();
  toast('Ajustes salvos');
});

/* Velocidade pelo GPS */
let watchId = null;
function setSpeed(kmh) {
  const text = kmh === null ? '--' : String(kmh);
  $('speed-value').textContent = text;
  $('mini-speed').textContent = text;
  const ratio = Math.min((kmh ?? 0) / GAUGE_MAX, 1);
  const fill = $('gauge-fill');
  fill.style.strokeDashoffset = String(GAUGE_ARC * (1 - ratio));
  fill.style.stroke = kmh >= 120 ? '#ff453a' : kmh >= 80 ? '#ffd60a' : '';
}

function setGpsStatus(text, on) {
  $('speed-hint').textContent = text;
  $('speed-hint').classList.toggle('on', on);
  $('gps-dot').classList.toggle('on', on);
}

function startGps() {
  if (!('geolocation' in navigator)) return toast('GPS indisponível neste navegador');
  if (!window.isSecureContext) return toast('O GPS exige HTTPS');
  if (watchId !== null) return;
  setGpsStatus('Procurando sinal de GPS…', false);
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const kmh = toKmh(pos.coords.speed);
      setSpeed(kmh ?? 0);
      setGpsStatus(`GPS ativo · precisão ${Math.round(pos.coords.accuracy)} m`, true);
      onPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    },
    (err) => {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      setSpeed(null);
      if (err.code === err.PERMISSION_DENIED) {
        state.gps = false;
        save();
        setGpsStatus('Localização negada. Libere em Ajustes do iPhone → Privacidade → Serviços de Localização', false);
      } else {
        setGpsStatus('Sem sinal de GPS. Toque para tentar de novo', false);
      }
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
  );
  state.gps = true;
  save();
}

$('gauge').addEventListener('click', startGps);

/* Mapa e clima do Painel: seguem a posição do GPS (sem GPS, a última conhecida ou São Paulo) */
const MAP_MOVE_M = 60; // redesenha o mapa a cada 60 m (os tiles ficam no cache do navegador)
const MAP_ZOOM = 16;
const WEATHER_EVERY = 15 * 60_000;
let mapPos = null;
let weatherPos = null;
let weatherAt = 0;
let posSavedAt = 0;

function onPosition(p) {
  state.lastPos = p;
  if (Date.now() - posSavedAt > 60_000) {
    posSavedAt = Date.now();
    save();
  }
  if (!mapPos || distanceM(mapPos, p) > MAP_MOVE_M) {
    mapPos = p;
    renderMap();
  }
  if (Date.now() - weatherAt > WEATHER_EVERY || (weatherPos && distanceM(weatherPos, p) > 10_000)) refreshWeather(p);
}

// Desenha os tiles em volta da posição; o ponto azul fica um pouco acima do meio,
// porque os botões de Casa e Trabalho cobrem a parte de baixo do card.
let mapKey = '';
function renderMap() {
  const el = $('map');
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!mapPos || !w || !h) return;
  const cy = Math.round(h * 0.3);
  const key = `${mapPos.lat},${mapPos.lon},${w},${h}`;
  if (key === mapKey) return;
  mapKey = key;
  const imgs = mapTiles(mapPos, MAP_ZOOM, w, h, w / 2, cy).map((t) => {
    const img = document.createElement('img');
    img.alt = '';
    img.src = t.url;
    img.style.left = `${t.left}px`;
    img.style.top = `${t.top}px`;
    return img;
  });
  const dot = document.createElement('i');
  dot.className = 'map-dot';
  dot.style.left = `${w / 2}px`;
  dot.style.top = `${cy}px`;
  el.replaceChildren(...imgs, dot);
}
new ResizeObserver(() => renderMap()).observe($('map'));

async function refreshWeather(p) {
  weatherAt = Date.now();
  weatherPos = p;
  try {
    const w = await fetchWeather(p);
    if (!w) return;
    const el = $('weather');
    el.innerHTML = `${w.icon} <b></b> <span></span> <small></small>`;
    el.querySelector('b').textContent = `${w.temp}°`;
    el.querySelector('span').textContent = w.label;
    el.querySelector('small').textContent = `${w.max}° / ${w.min}°`;
    el.hidden = false;
  } catch {
    weatherAt = Date.now() - WEATHER_EVERY + 60_000; // tenta de novo em 1 min
  }
}

/* Manter tela acesa (Screen Wake Lock) */
let lock = null;
async function acquireLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
    return true;
  } catch {
    return false;
  }
}

function renderAwake() {
  $('awake').setAttribute('aria-pressed', String(state.awake));
}

$('awake').addEventListener('click', async () => {
  if (state.awake) {
    state.awake = false;
    await lock?.release();
    toast('Tela volta a apagar sozinha');
  } else {
    if (!(await acquireLock())) {
      return toast('Sem suporte aqui. No iPhone: Ajustes → Tela e Brilho → Bloqueio Automático → Nunca');
    }
    state.awake = true;
    toast('A tela vai ficar acesa');
  }
  save();
  renderAwake();
});

// O sistema solta o bloqueio quando o app sai da frente; pega de novo ao voltar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.awake && !lock) acquireLock();
});

/* Spotify: mostra e controla o que toca na conta (app do iPhone, computador, etc.) */
const POLL_MS = 5000;
let spPlayer = null; // resultado de sp.parsePlayer
let spNoDevice = false; // nenhum Spotify aberto na conta: não há o que controlar
let spSyncedAt = 0; // quando spPlayer.progress foi lido
let pollTimer = null;
let progressTimer = null;

function spErrorMessage(e) {
  if (e.reason === 'PREMIUM_REQUIRED') return 'Esse controle exige Spotify Premium';
  if (e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') return 'Nenhum Spotify aberto. Toque em Abrir Spotify e volte aqui';
  if (e.status === 401) return 'Conecte o Spotify de novo em Ajustes';
  if (e.status === 429) return 'Spotify pediu uma pausa. Tente em instantes';
  return `Spotify: ${e.message}`;
}

function currentProgress() {
  if (!spPlayer) return 0;
  const p = spPlayer.progress + (spPlayer.isPlaying ? Date.now() - spSyncedAt : 0);
  return Math.min(p, spPlayer.duration);
}

function setAll(selector, fn) {
  for (const el of document.querySelectorAll(selector)) fn(el);
}

function renderProgress() {
  const p = currentProgress();
  const ratio = spPlayer?.duration ? p / spPlayer.duration : 0;
  setAll('.sp-fill', (el) => { el.style.width = `${ratio * 100}%`; });
  setAll('.sp-pos', (el) => { el.textContent = sp.formatTime(p); });
}

function renderPlayer() {
  const s = spPlayer;
  setAll('.sp-title', (el) => { el.textContent = s?.title || 'Nada tocando'; });
  const idle = spNoDevice ? 'Abra o Spotify no celular ou no PC' : 'Toque ▶ para retomar';
  setAll('.sp-artist', (el) => { el.textContent = s?.artist || (s ? '' : idle); });
  setAll('.sp-open', (el) => { el.hidden = Boolean(s) || !spNoDevice; });
  setAll('.sp-dur', (el) => { el.textContent = sp.formatTime(s?.duration); });
  setAll('.sp-device', (el) => { el.textContent = s?.device ? `Tocando em ${s.device}` : ''; });
  setAll('.sp-art img', (el) => {
    if (s?.art && el.getAttribute('src') !== s.art) el.src = s.art;
    el.hidden = !s?.art;
  });
  setAll('.sp-toggle', (el) => {
    el.innerHTML = `<svg><use href="#i-${s?.isPlaying ? 'pause' : 'play'}"/></svg>`;
    el.setAttribute('aria-label', s?.isPlaying ? 'Pausar' : 'Tocar');
  });
  setAll('.sp-shuffle', (el) => el.setAttribute('aria-pressed', String(Boolean(s?.shuffle))));
  renderProgress();
  renderMusicCard();
}

// Card "Tocando" do Painel: Spotify quando está tocando; senão, o vídeo do YouTube (se houver).
function renderMusicCard() {
  const v = youtube?.current;
  const showYt = Boolean(v?.id || v?.title) && !(sp.isConnected() && spPlayer?.isPlaying);
  const card = document.querySelector('.music-card');
  $('yt-mini').hidden = !showYt;
  for (const el of card.querySelectorAll('[data-sp-connected]')) el.hidden = showYt || !sp.isConnected();
  for (const el of card.querySelectorAll('[data-sp-disconnected]')) el.hidden = showYt || sp.isConnected();
  if (!showYt) return;
  $('yt-mini-title').textContent = v.title || 'Vídeo do YouTube';
  $('yt-mini-channel').textContent = v.channel || 'YouTube';
  const img = $('yt-mini-img');
  const thumb = v.thumb || (v.id ? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg` : '');
  if (thumb && img.getAttribute('src') !== thumb) img.src = thumb;
  img.hidden = !thumb;
  $('yt-mini-toggle').innerHTML = `<svg><use href="#i-${youtube.playing ? 'pause' : 'play'}"/></svg>`;
  $('yt-mini-toggle').setAttribute('aria-label', youtube.playing ? 'Pausar' : 'Tocar');
}

document.querySelector('.music-card').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ytc]');
  if (!b || !youtube) return;
  if (b.dataset.ytc === 'toggle') youtube.toggle();
  else youtube.seekBy(b.dataset.ytc === 'back' ? -10 : 10);
});

async function spRefresh() {
  if (!sp.isConnected()) return;
  try {
    spPlayer = await sp.getPlayer();
    spSyncedAt = Date.now();
    spNoDevice = !spPlayer && !(await sp.getDevices()).length;
  } catch (e) {
    if (e.status === 401 && !sp.isConnected()) {
      render();
      toast(spErrorMessage(e));
    }
    return;
  }
  renderPlayer();
}

// Só consulta a API com o app na frente e numa tela que mostra a música.
function spSchedule() {
  clearInterval(pollTimer);
  clearInterval(progressTimer);
  pollTimer = progressTimer = null;
  const v = currentView();
  if (!sp.isConnected() || document.visibilityState !== 'visible' || (v !== 'music' && v !== 'dash')) return;
  spRefresh();
  pollTimer = setInterval(spRefresh, POLL_MS);
  progressTimer = setInterval(renderProgress, 1000);
}

document.addEventListener('visibilitychange', spSchedule);

const spCommands = {
  async toggle() {
    if (spPlayer?.isPlaying) {
      spPlayer.progress = currentProgress();
      spPlayer.isPlaying = false;
      renderPlayer();
      await sp.pause();
    } else {
      if (spPlayer) {
        spPlayer.isPlaying = true;
        spSyncedAt = Date.now();
        renderPlayer();
      }
      await sp.play();
    }
  },
  next: () => sp.next(),
  prev: () => sp.previous(),
  async shuffle() {
    const on = !spPlayer?.shuffle;
    if (spPlayer) spPlayer.shuffle = on;
    renderPlayer();
    await sp.setShuffle(on);
  },
  lists: openPlaylists,
};

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-sp]');
  if (!btn) return;
  try {
    await spCommands[btn.dataset.sp]();
  } catch (err) {
    toast(spErrorMessage(err));
  }
  // O Spotify demora um pouco para refletir o comando.
  if (btn.dataset.sp !== 'lists') setTimeout(spRefresh, 700);
});

async function openPlaylists() {
  const list = $('playlist-list');
  list.innerHTML = '<li class="empty-row">Carregando…</li>';
  $('lists-sheet').showModal();
  let items;
  try {
    items = await sp.getPlaylists();
  } catch (e) {
    list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'empty-row';
    li.textContent = spErrorMessage(e);
    list.append(li);
    return;
  }
  list.replaceChildren();
  if (!items.length) list.innerHTML = '<li class="empty-row">Nenhuma playlist encontrada.</li>';
  for (const pl of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row-btn';
    b.innerHTML = '<span class="art sm"><svg><use href="#i-music"/></svg><img alt="" hidden></span><span></span>';
    const img = b.querySelector('img');
    const url = pl.images?.at(-1)?.url ?? pl.images?.[0]?.url;
    if (url) { img.src = url; img.hidden = false; }
    b.lastChild.textContent = pl.name;
    b.onclick = async () => {
      $('lists-sheet').close();
      try {
        await sp.play({ context_uri: pl.uri });
        toast(`Tocando ${pl.name}`);
        setTimeout(spRefresh, 900);
      } catch (err) {
        toast(spErrorMessage(err));
      }
    };
    li.append(b);
    list.append(li);
  }
}

/* Meu carro: guarda onde estacionou e traça a rota a pé até lá */
function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator) || !window.isSecureContext) return reject(new Error('sem GPS'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 },
    );
  });
}

function renderPark() {
  const p = state.parked;
  const info = $('park-info');
  if (p) {
    const far = state.lastPos ? distanceM(state.lastPos, p) : null;
    const dist = far == null ? '' : far < 1000 ? ` · a ${Math.round(far / 10) * 10} m daqui` : ` · a ${(far / 1000).toFixed(1)} km daqui`;
    info.textContent = `Local salvo ${timeAgo(p.t)}${dist}.`;
  } else {
    info.textContent = 'Nenhum local salvo. Ao estacionar, toque em "Estacionei aqui".';
  }
  $('park-walk').hidden = !p;
  $('park-clear').hidden = !p;
  $('park-save').classList.toggle('secondary', Boolean(p));
}

function openPark() {
  renderPark();
  $('park-sheet').showModal();
}

async function savePark() {
  toast('Pegando a localização…');
  try {
    const p = await currentPosition();
    state.parked = { ...p, t: Date.now() };
  } catch {
    if (!state.lastPos) return toast('Não consegui a localização. Libere o GPS e tente de novo');
    state.parked = { ...state.lastPos, t: Date.now() };
  }
  save();
  renderPark();
  toast('Local do carro salvo');
}

$('park-save').addEventListener('click', savePark);
$('park-walk').addEventListener('click', () => state.parked && open(walkUrl(state.parked)));
$('park-clear').addEventListener('click', () => {
  state.parked = null;
  save();
  renderPark();
});

/* Voz nos campos de busca: fala em vez de abrir o teclado, e a busca vai sozinha */
let voice = null; // { stop } enquanto escuta

for (const btn of document.querySelectorAll('[data-mic-for]')) {
  btn.hidden = !voiceSupported;
  btn.addEventListener('click', async () => {
    if (voice) return voice.stop(); // segundo toque encerra e usa o que ouviu
    const input = $(btn.dataset.micFor);
    const placeholder = input.placeholder;
    input.blur();
    input.value = '';
    input.placeholder = 'Ouvindo…';
    btn.classList.add('listening');
    const session = listen({ onPartial: (text) => { input.value = text; } });
    voice = { stop: session.stop };
    try {
      input.value = await session.done;
      input.form.requestSubmit();
    } catch (e) {
      toast(voiceErrorMessage(e.message));
    } finally {
      voice = null;
      btn.classList.remove('listening');
      input.placeholder = placeholder;
    }
  });
}

/* Assistente de voz (🎤 do dock): ouve, entende e executa, com a bolha estilo Siri */
let assistTimer;
let assistSession = null;

function assistShow(heard, reply, { keep = false } = {}) {
  clearTimeout(assistTimer);
  $('assistant').hidden = false;
  $('assistant-heard').textContent = heard;
  $('assistant-reply').textContent = reply;
  if (!keep) assistTimer = setTimeout(() => { $('assistant').hidden = true; }, 3200);
}

async function runCommand(text) {
  const cmd = parseCommand(text);
  const say = (reply) => assistShow(`“${text}”`, reply);
  const ytActive = Boolean(youtube?.current);
  switch (cmd.type) {
    case 'pause':
      if (ytActive && youtube.playing) youtube.pause();
      else if (sp.isConnected()) await sp.pause();
      return say('Pausado');
    case 'resume':
      if (ytActive) youtube.resume();
      else if (sp.isConnected()) await sp.play();
      return say('Tocando');
    case 'next':
      await sp.next();
      setTimeout(spRefresh, 700);
      return say('Próxima');
    case 'prev':
      await sp.previous();
      setTimeout(spRefresh, 700);
      return say('Anterior');
    case 'youtube': {
      goView('youtube');
      say(`Procurando “${cmd.query}” no YouTube…`);
      const title = await youtube.searchAndPlay(cmd.query);
      return say(title ? `Tocando ${title}` : 'Nenhum vídeo encontrado');
    }
    case 'music': {
      if (sp.isConnected()) {
        try {
          const hit = await sp.searchPlayable(cmd.query);
          if (hit) {
            await sp.play(hit.body);
            setTimeout(spRefresh, 900);
            return say(`Tocando ${hit.name} no Spotify`);
          }
        } catch (e) {
          if (e.reason === 'NO_ACTIVE_DEVICE' || e.status === 404) return say(spErrorMessage(e));
          // Busca do Spotify indisponível: cai para o YouTube.
        }
      }
      goView('youtube');
      const title = await youtube.searchAndPlay(cmd.query);
      return say(title ? `Tocando ${title} no YouTube` : 'Não encontrei');
    }
    case 'nav':
      if (cmd.saved) {
        if (!state[cmd.saved]) return say(`Defina o endereço de ${cmd.saved === 'home' ? 'casa' : 'trabalho'} em Ajustes`);
        say(`Navegando para ${cmd.saved === 'home' ? 'casa' : 'o trabalho'}`);
        return goSaved(cmd.saved);
      }
      say(`Navegando para ${cmd.to}`);
      return go(cmd.to);
    case 'call':
    case 'sms': {
      const c = findContact(state.contacts, cmd.name);
      if (!c) return say(`Não achei “${cmd.name}” nos favoritos`);
      say(cmd.type === 'call' ? `Ligando para ${c.name}` : `Mensagem para ${c.name}`);
      return open(cmd.type === 'call' ? telUrl(c.phone) : smsUrl(c.phone));
    }
    case 'parkSave':
      await savePark();
      return say('Local do carro salvo');
    case 'parkFind':
      if (!state.parked) return say('Nenhum local salvo');
      say('Abrindo a rota a pé até o carro');
      return open(walkUrl(state.parked));
    case 'open':
      if (cmd.view === 'settings') openSettings();
      else goView(cmd.view);
      return say('Pronto');
    default:
      return say('Não entendi. Tente “toca … no YouTube” ou “navegar para casa”');
  }
}

$('assist-btn').addEventListener('click', async () => {
  if (!voiceSupported) return toast('Este navegador não reconhece voz');
  if (assistSession) return assistSession.stop();
  $('assist-btn').classList.add('listening');
  assistShow('Ouvindo…', 'Ex.: “toca Legião no YouTube”, “navegar para casa”', { keep: true });
  assistSession = listen({ onPartial: (t) => assistShow(t, '…', { keep: true }) });
  try {
    const text = await assistSession.done;
    assistSession = null;
    $('assist-btn').classList.remove('listening');
    await runCommand(text);
  } catch (e) {
    assistSession = null;
    $('assist-btn').classList.remove('listening');
    const known = ['no-speech', 'not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'unsupported'];
    const msg = e instanceof sp.SpotifyError ? spErrorMessage(e) : known.includes(e.message) ? voiceErrorMessage(e.message) : e.message;
    assistShow('Ops', msg || 'Algo deu errado');
  }
});

// Tocar na bolha encerra a escuta ou fecha a bolha.
$('assistant').addEventListener('click', () => {
  if (assistSession) assistSession.stop();
  else $('assistant').hidden = true;
});

/* Ações dos ícones (grade, dock e painel) */
const actions = {
  nav: openNav,
  music: () => (sp.isConnected() ? goView('music') : open(musicUrl(state.musicApp))),
  'music-view': () => goView('music'),
  'spotify-app': () => open('spotify:'),
  'sp-setup': spConnect,
  youtube: () => goView('youtube'),
  park: openPark,
  phone: () => openContacts('tel'),
  messages: () => openContacts('sms'),
  home: () => goSaved('home'),
  work: () => goSaved('work'),
  speed: () => { goView('speed'); startGps(); },
  dash: () => goView('dash'),
  settings: () => openSettings(),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.();
  const ext = e.target.closest('[data-url]');
  if (ext) open(ext.dataset.url);
});

// Fecha as folhas ao tocar fora delas.
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}

function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

tick();
initSquircles();
youtube = initYouTube({ state, save, toast, open, onChange: () => renderMusicCard() });
renderExtras();
render();
renderAwake();
renderPlayer();
showView();
sp.handleRedirect().then((result) => {
  if (!result) return;
  render();
  if (result === 'ok') {
    toast('Spotify conectado');
    goView('music');
    spSchedule();
  } else {
    toast(result.slice('error:'.length));
  }
});
// Mapa e clima já aparecem com a última posição; o GPS liga sozinho (no carro, ele é a base de tudo).
onPosition(state.lastPos ?? DEFAULT_POS);
if (window.isSecureContext && 'geolocation' in navigator) startGps();
if (state.awake) acquireLock();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
