// Converts Hex (#3b82f6) to Tailwind HSL (217 91% 60%)
export function hexToTailwindHsl(hex: string): string {
  if (!hex) return '0 0% 0%';
  let r = 0,
    g = 0,
    b = 0;
  if (hex.length === 4) {
    r = Number.parseInt('0x' + hex[1] + hex[1]);
    g = Number.parseInt('0x' + hex[2] + hex[2]);
    b = Number.parseInt('0x' + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = Number.parseInt('0x' + hex[1] + hex[2]);
    g = Number.parseInt('0x' + hex[3] + hex[4]);
    b = Number.parseInt('0x' + hex[5] + hex[6]);
  }

  r /= 255;
  g /= 255;
  b /= 255;

  const cmin = Math.min(r, g, b);
  const cmax = Math.max(r, g, b);
  let h = 0,
    s = 0,
    l = (cmin + cmax) / 2;
  const delta = cmax - cmin;

  if (delta === 0) h = 0;
  else if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;
  l = +(l * 100).toFixed(1);
  s =
    delta === 0
      ? 0
      : +((delta / (1 - Math.abs((2 * l) / 100 - 1))) * 100).toFixed(1);

  return `${h} ${s}% ${l}%`;
}

export default hexToTailwindHsl;
