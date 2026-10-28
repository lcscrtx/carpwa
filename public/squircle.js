// Cantos contínuos (squircle), como no iOS e no "corner smoothing" do Figma.
// O Safari não tem corner-shape, então a curva vira um clip-path: path() calculado
// para o tamanho de cada elemento. A matemática segue a do Figma (lib figma-squircle).

export const SMOOTHING = 0.6; // iOS ≈ 60%

const rad = (deg) => (deg * Math.PI) / 180;

function corner(radius, smoothing, budget) {
  if (radius <= 0) return null;
  const r = Math.min(radius, budget);
  const s = Math.min(smoothing, budget / r - 1);
  const p = Math.min((1 + s) * r, budget);
  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(rad(arcMeasure / 2)) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3ToP4 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * s;
  const c = p3ToP4 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - arc - c - d) / 3;
  const a = 2 * b;
  return { r, p, arc, a, b, c, d };
}

const n = (v) => +v.toFixed(2);

// Caminho SVG de um retângulo w×h com raios [topo-esq, topo-dir, baixo-dir, baixo-esq].
// ox/oy deslocam o caminho (usado para o contorno interno da borda).
export function squirclePath(w, h, radii, smoothing = SMOOTHING, ox = 0, oy = 0) {
  const budget = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => corner(r, smoothing, budget));
  const P = (x, y) => `${n(x + ox)} ${n(y + oy)}`;
  const arcTo = (k, dx, dy) => `a ${n(k.r)} ${n(k.r)} 0 0 1 ${n(dx)} ${n(dy)}`;
  const parts = [`M ${P(w - (tr?.p ?? 0), 0)}`];

  if (tr) {
    const { a, b, c, d, arc } = tr;
    parts.push(`c ${n(a)} 0 ${n(a + b)} 0 ${n(a + b + c)} ${n(d)}`, arcTo(tr, arc, arc), `c ${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(a + b + c)}`);
  }
  parts.push(`L ${P(w, h - (br?.p ?? 0))}`);
  if (br) {
    const { a, b, c, d, arc } = br;
    parts.push(`c 0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(a + b + c)}`, arcTo(br, -arc, arc), `c ${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-(a + b + c))} ${n(d)}`);
  }
  parts.push(`L ${P(bl?.p ?? 0, h)}`);
  if (bl) {
    const { a, b, c, d, arc } = bl;
    parts.push(`c ${n(-a)} 0 ${n(-(a + b))} 0 ${n(-(a + b + c))} ${n(-d)}`, arcTo(bl, -arc, -arc), `c ${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-(a + b + c))}`);
  }
  parts.push(`L ${P(0, tl?.p ?? 0)}`);
  if (tl) {
    const { a, b, c, d, arc } = tl;
    parts.push(`c 0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-(a + b + c))}`, arcTo(tl, arc, -arc), `c ${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(a + b + c)} ${n(-d)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

// "23%" ou "24px" → px, com % relativo ao lado correspondente.
export function toPx(value, size) {
  const v = parseFloat(value) || 0;
  return String(value).trim().endsWith('%') ? (v / 100) * size : v;
}

/* Aplicação no DOM */

// Tudo que tem border-radius no style.css (círculos e pílulas ficam de fora: já são curvas).
// O player do YouTube (.yt-float) fica de fora: clip-path em volta de iframe desloca o vídeo no iPhone.
const SELECTOR = [
  '.ico', '.dock', '.dock-mic', '.dock-awake', '.dock-home', '.card', '.dest', '.art',
  '.ctrls button', '.search input', '.primary', '.list', '.group', '.sheet',
  '.yt-box', '.yt-thumb', '.seg', '.yt-dash-slot',
].join(',');
// Elementos com borda de 1px: a borda é redesenhada como anel no ::after.
const RING = '.card, .dock';

// Recalcula na hora (para quando o raio muda sem mudar o tamanho).
export function refreshSquircle(el) {
  apply(el);
}

function apply(el) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!w || !h) return;
  const cs = getComputedStyle(el);
  const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
    .map((r) => toPx(r.split(' ')[0], w));
  const half = Math.min(w, h) / 2;
  // Sem cantos, ou já redondo por inteiro: não há o que suavizar.
  if (radii.every((r) => r <= 0) || radii.every((r) => r >= half - 0.5)) {
    el.classList.remove('sq', 'sq-ring');
    return;
  }
  const outer = squirclePath(w, h, radii);
  el.style.setProperty('--sq-clip', `path('${outer}')`);
  el.classList.add('sq');
  if (el.matches(RING)) {
    const inner = squirclePath(w - 2, h - 2, radii.map((r) => Math.max(r - 1, 0)), SMOOTHING, 1, 1);
    el.style.setProperty('--sq-ring', `path(evenodd, '${outer} ${inner}')`);
    el.classList.add('sq-ring');
  }
}

export function initSquircles(root = document) {
  if (!('ResizeObserver' in window)) return;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) apply(e.target);
  });
  const watch = (scope) => {
    if (scope.matches?.(SELECTOR)) ro.observe(scope);
    scope.querySelectorAll?.(SELECTOR).forEach((el) => ro.observe(el));
  };
  watch(root);
  // Listas e favoritos são montados depois; observa o que for entrando.
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((node) => node.nodeType === 1 && watch(node));
  }).observe(root.body ?? root, { childList: true, subtree: true });
  // Raio pode mudar sem mudar tamanho (ex.: girar o celular muda a media query).
  matchMedia('(orientation: landscape)').addEventListener('change', () => {
    document.querySelectorAll(SELECTOR).forEach(apply);
  });
}
