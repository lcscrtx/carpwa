// Tela do YouTube: busca, favoritos e player.
import * as yt from './youtube.js';
import { refreshSquircle } from './squircle.js';

const MAX_FAVES = 30;

export function initYouTube({ state, save, toast, open, onChange = () => {} }) {
  const $ = (id) => document.getElementById(id);
  state.ytFaves ??= [];

  let player = null; // YT.Player
  let playerReady = null; // Promise do player pronto
  let current = null; // { id, title, channel, thumb, duration }
  let results = [];
  let tab = 'results';
  let searchCtrl = null;
  let status = ''; // mensagem no lugar dos resultados
  let view = null; // tela visível que pode mostrar o vídeo ('youtube' ou 'dash')

  /* Player flutuante: acompanha o espaço reservado na tela atual */

  const float = $('yt-float');

  function slot() {
    if (!current) return null;
    if (view === 'youtube') return $('yt-box');
    if (view === 'dash') return $('yt-dash-slot');
    return null;
  }

  // No iPhone o YouTube não refaz o enquadramento quando o iframe muda só pelo CSS
  // (o vídeo ficava deslocado e cortado). setSize obriga o player a recalcular.
  let playerSize = '';
  function resizePlayer(w, h) {
    const key = `${w}x${h}`;
    if (!w || !h || key === playerSize || !player?.setSize) return;
    playerSize = key;
    player.setSize(w, h);
  }

  function place() {
    const s = slot();
    if (!s || !s.offsetWidth) {
      float.classList.remove('on');
      return;
    }
    // Coordenadas relativas à área das telas (.views), que corta o que passar dela.
    // O tamanho vem do layout (offsetWidth), não do retângulo, que encolhe na animação de entrada.
    const r = s.getBoundingClientRect();
    const base = float.offsetParent.getBoundingClientRect();
    const w = s.offsetWidth;
    const h = s.offsetHeight;
    Object.assign(float.style, {
      left: `${r.left - base.left}px`,
      top: `${r.top - base.top}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
    float.classList.add('on');
    resizePlayer(w, h);
    // Mesmos cantos do espaço onde está (card do Painel ou caixa da tela do YouTube).
    const radius = getComputedStyle(s).borderTopLeftRadius;
    const inDash = view === 'dash';
    if (float.style.borderRadius !== radius || float.classList.contains('in-dash') !== inDash) {
      float.style.borderRadius = radius;
      float.classList.toggle('in-dash', inDash);
      refreshSquircle(float);
    }
  }

  // As telas entram com animação; acompanha o espaço até ela terminar.
  function settle(ms = 400) {
    const end = performance.now() + ms;
    const step = () => {
      place();
      if (performance.now() < end) requestAnimationFrame(step);
    };
    step();
    setTimeout(place, ms + 50); // garante a posição final mesmo se o rAF for adiado
  }

  const ro = new ResizeObserver(() => place());
  ro.observe($('yt-box'));
  ro.observe($('yt-dash-slot'));
  window.addEventListener('resize', () => settle(200));
  document.querySelector('.widgets').addEventListener('scroll', place, { passive: true });
  $('pager').addEventListener('scroll', place, { passive: true }); // arrastar entre Painel e Apps

  // Card do Painel: aparece no lugar dos Favoritos enquanto houver vídeo.
  function renderDash() {
    $('yt-dash-card').hidden = !current;
    document.querySelector('.contacts-card').hidden = Boolean(current);
  }

  function stop() {
    try {
      player?.stopVideo?.();
    } catch {
      // player ainda carregando
    }
    current = null;
    playing = false;
    clearInterval(progressTimer);
    renderToggle();
    $('yt-progress-fill').style.width = '0';
    $('yt-empty').hidden = false;
    renderNow();
    renderDash();
    place();
  }

  $('yt-dash-close').addEventListener('click', stop);

  /* Player */

  function ensurePlayer() {
    playerReady ??= yt.loadPlayerApi().then(
      (YT) =>
        new Promise((resolve) => {
          // Nasce com o tamanho da caixa do vídeo (a camada ainda está escondida e sem tamanho).
          const box = $('yt-box');
          const w = box.offsetWidth || 640;
          const h = box.offsetHeight || 360;
          playerSize = `${w}x${h}`;
          player = new YT.Player('yt-player', {
            width: String(w),
            height: String(h),
            // Sem os controles pequenos do YouTube: usamos toque no vídeo e botões grandes.
            playerVars: { playsinline: 1, rel: 0, controls: 0, fs: 0, disablekb: 1, iv_load_policy: 3, origin: location.origin },
            events: {
              onReady: () => {
                resolve(player);
                playerSize = '';
                place(); // ajusta ao espaço real assim que o player existe
              },
              onStateChange: onPlayerState,
              onError: (e) => toast(yt.playerErrorMessage(e.data)),
            },
          });
        }),
    );
    playerReady.catch((e) => {
      playerReady = null;
      toast(e.message);
    });
    return playerReady;
  }

  /* Controles próprios: toque no vídeo, ⟲10 ⏯ ⟳10 e barra de progresso */

  let playing = false;
  let progressTimer = null;

  function renderToggle() {
    $('yt-toggle').innerHTML = `<svg><use href="#i-${playing ? 'pause' : 'play'}"/></svg>`;
    $('yt-toggle').setAttribute('aria-label', playing ? 'Pausar' : 'Tocar');
    onChange();
  }

  function renderProgress() {
    const d = player?.getDuration?.() || 0;
    const t = player?.getCurrentTime?.() || 0;
    $('yt-progress-fill').style.width = d ? `${Math.min(t / d, 1) * 100}%` : '0';
  }

  function toggle() {
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  }

  function seekBy(seconds) {
    if (!player?.getCurrentTime) return;
    player.seekTo(Math.max(0, player.getCurrentTime() + seconds), true);
    renderProgress();
  }

  // Ícone grande que aparece e some no meio do vídeo, como no iOS.
  function flash(icon) {
    const el = $('yt-flash');
    el.innerHTML = `<svg><use href="#i-${icon}"/></svg>`;
    el.classList.remove('show');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('show');
  }

  $('yt-tap').addEventListener('click', () => {
    flash(playing ? 'pause' : 'play');
    toggle();
  });
  $('yt-toggle').addEventListener('click', toggle);
  for (const b of document.querySelectorAll('[data-yt-seek]')) {
    b.addEventListener('click', () => seekBy(Number(b.dataset.ytSeek)));
  }
  $('yt-progress').addEventListener('click', (e) => {
    const d = player?.getDuration?.();
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    player.seekTo(((e.clientX - r.left) / r.width) * d, true);
    renderProgress();
  });

  function onPlayerState(e) {
    const S = window.YT?.PlayerState ?? {};
    if (e.data === S.PLAYING || e.data === S.PAUSED || e.data === S.ENDED) {
      playing = e.data === S.PLAYING;
      renderToggle();
      renderProgress();
      clearInterval(progressTimer);
      if (playing) progressTimer = setInterval(renderProgress, 500);
    }
    // O primeiro play precisa ser no botão do próprio YouTube (exigência do iPhone);
    // depois disso a camada de toque assume.
    if (e.data === S.PLAYING) float.classList.add('ready');

    // Vídeos abertos por link não têm título até começarem a tocar.
    if (e.data !== S.PLAYING) return;
    const data = player.getVideoData?.() ?? {};
    if (!data.video_id) return;
    if (!current || current.id !== data.video_id || !current.title) {
      current = { id: data.video_id, title: data.title || 'Vídeo', channel: data.author || '', thumb: `https://i.ytimg.com/vi/${data.video_id}/mqdefault.jpg`, duration: '' };
      renderNow();
      renderDash();
    }
  }

  async function play(video, list = null) {
    // Playlist sem vídeo inicial: guarda um "atual" provisório até o player dizer qual é.
    current = video ?? { id: '', title: '', channel: '', thumb: '', duration: '' };
    renderNow();
    renderDash();
    $('yt-empty').hidden = true;
    place();
    const p = await ensurePlayer();
    if (video?.id) p.loadVideoById(video.id);
    else if (list) p.loadPlaylist({ listType: 'playlist', list });
  }

  function pause() {
    try {
      player?.pauseVideo?.();
    } catch {
      // player ainda carregando
    }
  }

  /* Faixa "tocando agora" */

  function isFave(id) {
    return state.ytFaves.some((v) => v.id === id);
  }

  function renderNow() {
    onChange();
    $('yt-now').hidden = !current;
    if (!current) return;
    $('yt-title').textContent = current.title || 'Carregando…';
    $('yt-channel').textContent = current.channel || '';
    const fav = isFave(current.id);
    $('yt-fav').setAttribute('aria-pressed', String(fav));
    $('yt-fav').innerHTML = `<svg><use href="#i-${fav ? 'star' : 'star-o'}"/></svg>`;
    $('yt-fav').disabled = !current.id;
  }

  $('yt-fav').addEventListener('click', () => {
    if (!current?.id) return;
    if (isFave(current.id)) {
      state.ytFaves = state.ytFaves.filter((v) => v.id !== current.id);
      toast('Removido dos favoritos');
    } else {
      const { id, title, channel, thumb, duration } = current;
      state.ytFaves = [{ id, title, channel, thumb, duration }, ...state.ytFaves].slice(0, MAX_FAVES);
      toast('Salvo nos favoritos');
    }
    save();
    renderNow();
    if (tab === 'faves') renderList();
  });

  $('yt-open').addEventListener('click', () => {
    const id = current?.id ?? player?.getVideoData?.().video_id;
    open(id ? `youtube://www.youtube.com/watch?v=${id}` : 'youtube://');
  });

  $('yt-expand').addEventListener('click', () => {
    const on = $('yt').classList.toggle('expanded');
    $('yt-expand').innerHTML = `<svg><use href="#i-${on ? 'shrink' : 'expand'}"/></svg>`;
    $('yt-expand').setAttribute('aria-label', on ? 'Reduzir vídeo' : 'Ampliar vídeo');
    settle(200);
  });

  /* Lista (resultados ou favoritos) */

  function renderList() {
    const list = $('yt-list');
    list.replaceChildren();
    for (const b of document.querySelectorAll('[data-yt-tab]')) b.setAttribute('aria-pressed', String(b.dataset.ytTab === tab));
    const items = tab === 'faves' ? state.ytFaves : results;
    const empty = tab === 'faves' ? 'Toque na ☆ de um vídeo para salvar aqui.' : status || 'Os resultados da busca aparecem aqui.';
    if (!items.length || (tab === 'results' && status)) {
      const li = document.createElement('li');
      li.className = 'empty-row';
      li.textContent = empty;
      list.append(li);
      return;
    }
    for (const v of items) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row-btn yt-row';
      b.innerHTML = '<span class="yt-thumb"><img alt="" loading="lazy"><i></i></span><span class="yt-row-text"><b></b><small></small></span>';
      b.querySelector('img').src = v.thumb || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
      b.querySelector('i').textContent = v.duration || '';
      b.querySelector('i').hidden = !v.duration;
      b.querySelector('b').textContent = v.title;
      b.querySelector('small').textContent = v.channel;
      b.onclick = () => play(v);
      li.append(b);
      list.append(li);
    }
  }

  for (const b of document.querySelectorAll('[data-yt-tab]')) {
    b.addEventListener('click', () => {
      tab = b.dataset.ytTab;
      renderList();
    });
  }

  function searchErrorMessage(e) {
    if (e.reason === 'noKey') return 'A busca precisa da chave da API do YouTube. Links colados continuam funcionando.';
    if (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded') {
      return 'Acabou a cota de buscas de hoje. Links e favoritos continuam funcionando.';
    }
    if (/referer|keyInvalid|API_KEY|forbidden/i.test(`${e.reason} ${e.message}`)) {
      return 'O Google recusou a chave. Confira se este endereço está liberado nas restrições da chave.';
    }
    return `Erro na busca: ${e.message}`;
  }

  $('yt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('yt-q').value.trim();
    if (!q) return;
    $('yt-q').blur();

    const link = yt.parseYouTube(q);
    if (link) {
      $('yt-q').value = '';
      play(link.video ? { id: link.video, title: '', channel: '', thumb: '', duration: '' } : null, link.list);
      return;
    }

    searchCtrl?.abort();
    searchCtrl = new AbortController();
    tab = 'results';
    status = 'Buscando…';
    renderList();
    try {
      results = await yt.search(q, searchCtrl.signal);
      status = results.length ? '' : 'Nenhum vídeo encontrado.';
    } catch (err) {
      if (err.name === 'AbortError') return;
      results = [];
      status = searchErrorMessage(err);
    }
    renderList();
  });

  renderList();

  return {
    // Tela do YouTube ou Painel: o vídeo aparece no espaço reservado e continua tocando.
    show(v) {
      view = v;
      if (v === 'youtube') ensurePlayer(); // carrega antes para o primeiro toque tocar rápido
      renderDash();
      settle();
    },
    // Outras telas: o vídeo some e pausa (o iOS não toca vídeo escondido).
    hide() {
      view = null;
      pause();
      place();
    },
    // Para o assistente de voz e o card "Tocando".
    get playing() {
      return playing;
    },
    get current() {
      return current;
    },
    pause,
    toggle,
    seekBy,
    resume() {
      player?.playVideo?.();
    },
    // Busca e toca o primeiro resultado. Retorna o título ou lança YouTubeError.
    async searchAndPlay(query) {
      tab = 'results';
      $('yt-q').value = query;
      status = 'Buscando…';
      renderList();
      try {
        results = await yt.search(query);
      } catch (e) {
        results = [];
        status = searchErrorMessage(e);
        renderList();
        throw new Error(status);
      }
      status = results.length ? '' : 'Nenhum vídeo encontrado.';
      renderList();
      if (!results.length) return null;
      play(results[0]);
      return results[0].title;
    },
  };
}
