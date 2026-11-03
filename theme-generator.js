// theme-generator.js - one base colour in, full theme out. No dependencies.
// Usage: node theme-generator.js "#C4572F"  ->  prints theme JSON (light + dark + CSS vars)

// ---------- colour math (sRGB <-> OKLab/OKLCH, Bjorn Ottosson) ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
}
function rgbToOklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}
function oklchToLinRgb({ L, C, H }) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = c => oklchToLinRgb(c).every(v => v >= -0.0005 && v <= 1.0005);
// Gamut clamp: keep L and H, lower chroma until the colour fits in sRGB.
function fit(c) {
  let { L, C, H } = c; L = clamp(L, 0, 1);
  while (C > 0 && !inGamut({ L, C, H })) C -= 0.002;
  return { L, C: Math.max(C, 0), H: ((H % 360) + 360) % 360 };
}
const toHex = c => '#' + oklchToLinRgb(fit(c)).map(v => Math.round(clamp(toGam(clamp(v, 0, 1)), 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

// WCAG 2.x: Y = 0.2126R + 0.7152G + 0.0722B (linear);  ratio = (Y1+0.05)/(Y2+0.05)
const lum = hex => { const [r, g, b] = hexToRgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Nudge lightness of `c` away from `bg` until contrast >= target.
function ensureContrast(c, bgHex, target = 4.5) {
  const dir = lum(bgHex) > 0.4 ? -1 : 1; let x = { ...c };
  for (let i = 0; i < 100 && contrast(toHex(x), bgHex) < target; i++) x.L = clamp(x.L + dir * 0.01, 0, 1);
  return x;
}
const onColor = hex => (contrast(hex, '#FFFFFF') >= contrast(hex, '#1A1A1A') ? '#FFFFFF' : '#1A1A1A');

// ---------- the theme equations ----------
function generateTheme(baseHex) {
  const b = rgbToOklch(hexToRgb(baseHex));
  const H = b.H;
  const C = Math.max(b.C, 0.06);                       // floor so greys still get a visible accent
  const warm = H < 110 || H >= 330;                    // reds/oranges/yellows/magentas
  const make = mode => {
    const dark = mode === 'dark';
    // 60% - background / surface: base hue, almost no chroma
    const bg      = { L: dark ? 0.18 : 0.97, C: clamp(C * 0.07, 0.004, 0.012), H };
    const surface = { L: dark ? 0.22 : 0.995, C: clamp(C * 0.05, 0.002, 0.012), H };
    const bgHex = toHex(bg);
    // 30% - secondary neutral ("sand"): hue drifts -10 deg, low chroma
    const sand = { L: dark ? 0.28 : 0.90, C: clamp(C * 0.20, 0.01, 0.045), H: H - 10 };
    // text: same hue, near-zero chroma, contrast >= 7 (AAA) on bg
    const text  = ensureContrast({ L: dark ? 0.95 : 0.22, C: 0.015, H }, bgHex, 7);
    const muted = ensureContrast({ L: dark ? 0.72 : 0.50, C: 0.02, H }, bgHex, 4.5);
    // 10% - accent: the base colour, L clamped to a usable band; shifted in dark mode
    const accent = ensureContrast({ L: dark ? clamp(b.L + 0.12, 0.62, 0.80) : clamp(b.L, 0.48, 0.62), C: dark ? C * 0.85 : C, H }, bgHex, 3);
    // light mode: button text is white, so darken accent until white-on-accent >= 4.5
    while (!dark && contrast(toHex(accent), '#FFFFFF') < 4.5 && accent.L > 0.3) accent.L -= 0.005;
    const accentHex = toHex(accent);
    const accentDark = { ...accent, L: accent.L + (dark ? 0.08 : -0.10), C: accent.C * 0.95 };
    // glossy shades: lighter highlight, deeper shadow, lifted text for gradients
    const accentLight = { ...accent, L: clamp(accent.L + (dark ? 0.08 : 0.16), 0, 0.92), C: accent.C * 0.8 };
    const accentDeep = { ...accent, L: clamp(accent.L - 0.2, 0.12, 1), C: accent.C * 0.9 };
    const textLight = { ...text, L: clamp(text.L + (dark ? -0.1 : 0.14), 0, 1) };
    const accentSoft = { L: dark ? 0.30 : 0.94, C: clamp(C * 0.22, 0.02, 0.06), H };
    // secondary accent: split-complementary (H+150), 60% chroma
    const second = ensureContrast({ L: dark ? 0.72 : 0.50, C: C * 0.6, H: H + 150 }, bgHex, 3);
    const border = { L: dark ? 0.32 : 0.86, C: clamp(C * 0.1, 0.005, 0.02), H };
    // status colours: fixed hues, chroma borrowed from the accent so they feel on-brand
    const status = (h) => toHex(ensureContrast({ L: dark ? 0.75 : 0.52, C: clamp(C * 0.9, 0.08, 0.16), H: h }, bgHex, 3));
    return {
      background: bgHex, surface: toHex(surface), sand: toHex(sand), border: toHex(border),
      text: toHex(text), muted: toHex(muted),
      accent: accentHex, accentDark: toHex(accentDark), accentSoft: toHex(accentSoft), accentLight: toHex(accentLight), accentDeep: toHex(accentDeep), textLight: toHex(textLight), onAccent: onColor(accentHex),
      secondary: toHex(second),
      success: status(150), warning: status(80), danger: status(25), info: status(240),
    };
  };
  // 10-step tonal scale: L runs 0.97 -> 0.25, chroma follows a sine bell peaking mid-scale
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  const scale = {};
  steps.forEach((s, i) => {
    const t = i / (steps.length - 1);
    scale[s] = toHex({ L: 0.97 - 0.72 * t, C: C * (0.25 + 0.75 * Math.sin(Math.PI * clamp(t * 0.9 + 0.05, 0, 1))), H });
  });
  // type & shape follow colour temperature and chroma
  const fonts = warm ? { heading: 'Fraunces', body: 'Inter' } : { heading: 'Manrope', body: 'Inter' };
  const radius = C > 0.14 ? '10px' : C > 0.08 ? '6px' : '2px';  // punchier colour -> softer corners
  const light = make('light'), dark = make('dark');
  const css = mode => Object.entries(mode).map(([k, v]) => `  --${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}: ${v};`).join('\n');
  return {
    base: { hex: baseHex, oklch: { L: +b.L.toFixed(3), C: +b.C.toFixed(3), H: +H.toFixed(1) } },
    colors: light, dark, scale, fonts, radius,
    checks: {
      textOnBg: +contrast(light.text, light.background).toFixed(2),
      mutedOnBg: +contrast(light.muted, light.background).toFixed(2),
      onAccent: +contrast(light.onAccent, light.accent).toFixed(2),
      accentOnBg: +contrast(light.accent, light.background).toFixed(2),
    },
    css: `:root {\n${css(light)}\n  --radius: ${radius};\n}\n.dark {\n${css(dark)}\n}`,
  };
}

if (require.main === module) {
  const t = generateTheme(process.argv[2] || '#C4572F');
  console.log(JSON.stringify(t, null, 2));
}
module.exports = { generateTheme, contrast };
