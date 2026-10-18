// SPDX-License-Identifier: Apache-2.0
// Original value-noise implementation. Integer hashing makes seeds repeatable.
export function hash(x, z, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let u = x - ix, v = z - iz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function fractal(x, z, seed, octaves, ridged = false) {
  let sum = 0, weight = 0, amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    const n = noise(x, z, seed + i * 37) * 2 - 1;
    sum += (ridged ? 1 - Math.abs(n) : n) * amplitude;
    weight += amplitude; amplitude *= .5; x *= 2; z *= 2;
  }
  return sum / weight;
}
export function terrace(height, step, strength) {
  const q = height / step, floor = Math.floor(q), f = q - floor;
  // Flat ledges with a continuous transition between them, also below zero.
  const t = Math.max(0, Math.min(1, (f - .65) / .35));
  const stepped = (floor + t * t * (3 - 2 * t)) * step;
  return height + (stepped - height) * strength;
}
export function layeredHeight(x, z, state) {
  let h = 0;
  const layers = state.layers.filter(layer => layer.enabled);
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i], seed = (state.seed + Math.imul(i, 1013)) >>> 0;
    const frequency = .09 * layer.scale;
    if (layer.kind === 'warp') {
      const dx = fractal(x * frequency, z * frequency, seed, layer.octaves);
      const dz = fractal(x * frequency + 19.1, z * frequency - 7.3, seed ^ 0x6a09e667, layer.octaves);
      x += dx * layer.strength * 12; z += dz * layer.strength * 12;
    } else if (layer.kind === 'terrace') h = terrace(h, layer.scale, layer.strength);
    else h += fractal(x * frequency, z * frequency, seed, layer.octaves, layer.kind === 'ridge') * layer.strength * 8;
  }
  return h * state.elevation;
}
export function newLayer(kind = 'fbm') {
  return { kind, enabled: true, strength: kind === 'terrace' ? .8 : .5, scale: 1, octaves: 5 };
}
export function layeredTerrain(terrain) {
  return { generator: 'layers-v1', seed: terrain.seed, elevation: terrain.elevation, palette: terrain.palette,
    resolution: 256, layers: [newLayer('warp'), newLayer('fbm'), { ...newLayer('ridge'), strength: .7 }] };
}
