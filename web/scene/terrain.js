// SPDX-License-Identifier: Apache-2.0
export const defaults = Object.freeze({ seed: 1847, elevation: 1, sun: 38, palette: 'natural', yaw: 0.28, pitch: 0.3, distance: 23, waterEnabled: true, waterLevel: 0.25 });

function hash(x, z, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let u = x - ix, v = z - iz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function heightAt(x, z, state) {
  let sum = 0, amplitude = 1, frequency = 0.09;
  for (let i = 0; i < 6; i++) {
    sum += (1 - Math.abs(noise(x * frequency, z * frequency, state.seed + i * 37) * 2 - 1)) * amplitude;
    amplitude *= 0.48; frequency *= 2.15;
  }
  const mountain = Math.exp(-((x + 5) ** 2 / 110 + (z + 10) ** 2 / 70)) * 5;
  const ridge = Math.exp(-((x - 10) ** 2 / 70 + (z + 6) ** 2 / 110)) * 3.8;
  const basin = Math.exp(-(x * x / 55 + (z - 4) ** 2 / 160)) * 3.7;
  return (sum * 3.8 + mountain + ridge - basin - 3.5) * state.elevation;
}
export function normalize(v) {
  const length = Math.hypot(...v) || 1;
  return v.map(x => x / length);
}
export function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }

export function terrainPoint(x, z, state) {
  const h = heightAt(x, z, state), water = state.waterEnabled && h < state.waterLevel;
  const normal = water ? [0, 1, 0] : normalize([heightAt(x - 0.08, z, state) - heightAt(x + 0.08, z, state), 0.16, heightAt(x, z - 0.08, state) - heightAt(x, z + 0.08, state)]);
  let color = water ? [0.14, 0.34, 0.36] : h > 5.4 ? [0.82, 0.85, 0.82] : normal[1] < 0.78 ? [0.39, 0.41, 0.37] : h < 0.6 ? [0.5, 0.48, 0.34] : [0.28, 0.35, 0.26];
  if (state.palette === 'otherworld') color = water ? [0.28, 0.31, 0.6] : h > 5.4 ? [0.83, 0.78, 0.93] : [0.35 + h * 0.022, 0.26 + normal[1] * 0.12, 0.4 + h * 0.017];
  return [x, water ? state.waterLevel : h, z, ...normal, ...color];
}

// A bounded fixture for exercising both renderers. The authoring library follows
// in wave 2. Water is an opaque preview surface, with no optical simulation.
export function createTerrain(state, resolution = 128) {
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 256) throw new Error('Invalid preview resolution');
  const vertices = new Float32Array(resolution * resolution * 6 * 9);
  let offset = 0;
  const point = (ix, iz) => {
    const x = (ix / resolution - 0.5) * 64;
    const z = (iz / resolution - 0.5) * 64;
    return terrainPoint(x, z, state);
  };
  const grid = Array.from({ length: resolution + 1 }, (_, z) => Array.from({ length: resolution + 1 }, (_, x) => point(x, z)));
  for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
    for (const p of [grid[z][x], grid[z+1][x], grid[z][x+1], grid[z][x+1], grid[z+1][x], grid[z+1][x+1]]) {
      vertices.set(p, offset); offset += 9;
    }
  }
  return vertices;
}

export function frameUniforms(state, aspect) {
  const target = [0, 1.8, -4];
  const eye = [Math.sin(state.yaw) * Math.cos(state.pitch) * state.distance, Math.sin(state.pitch) * state.distance + target[1], Math.cos(state.yaw) * Math.cos(state.pitch) * state.distance + target[2]];
  const forward = normalize(target.map((v, i) => v - eye[i]));
  const right = normalize(cross(forward, [0, 1, 0])), up = cross(right, forward);
  const light = normalize([-0.6, Math.sin(state.sun * Math.PI / 180), 0.45]);
  const fog = state.palette === 'otherworld' ? [0.39, 0.37, 0.53] : [0.57, 0.66, 0.67];
  return new Float32Array([...eye, aspect, ...right, 0, ...up, 0, ...forward, 0, ...light, 0, ...fog, 0]);
}
