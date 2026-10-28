function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

function mix(hex, target, amount) {
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return '#' + [1, 3, 5].map(i => Math.round(ch(hex, i) + (ch(target, i) - ch(hex, i)) * amount).toString(16).padStart(2, '0')).join('');
}

/** Nudges a Discord role color until it reads at 4.5:1 on the feed surface. */
export function readable(hex, theme) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const surface = theme === 'light' ? '#ffffff' : '#141920';
  const toward = theme === 'light' ? '#000000' : '#ffffff';
  let color = hex;
  for (let i = 0; i < 12 && contrast(color, surface) < 4.5; i++) color = mix(color, toward, 0.15);
  return color;
}
