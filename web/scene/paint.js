// SPDX-License-Identifier: Apache-2.0
// Vegetation paint: a 512 x 512 mask over the near tile that clears or plants vegetation,
// stored in the scene as scene.vegetation.paint = { resolution, data }. Each texel is one of
// 16 levels: NEUTRAL leaves the land's own cover, lower levels clear it (0 clears all),
// higher levels plant forest (15 plants it fully). Row 0 is the tile's north edge (lowest z).
//
// `data` is base64 of a run-length byte stream. Each run starts with a byte holding the level
// in its high nibble; a low nibble below 15 is the run length less one, and 15 means the
// length less 16 follows as an unsigned LEB128 number. Strokes with hard edges stay small;
// the whole scene is limited to 128 KiB, so encodings over PAINT_LIMIT are refused.

export const PAINT_SIZE = 512;
export const NEUTRAL = 8;
export const PAINT_LIMIT = 98304;

export function neutralPaint() {
  return new Uint8Array(PAINT_SIZE * PAINT_SIZE).fill(NEUTRAL);
}

export function isNeutral(levels) {
  return levels.every(level => level === NEUTRAL);
}

export function encodePaint(levels) {
  if (levels.length !== PAINT_SIZE * PAINT_SIZE) {
    throw new Error('Vegetation paint must be 512 x 512.');
  }
  const bytes = [];
  for (let i = 0; i < levels.length;) {
    const level = levels[i];
    let run = 1;
    while (i + run < levels.length && levels[i + run] === level) {
      run++;
    }
    if (run < 16) {
      bytes.push((level << 4) | (run - 1));
    } else {
      bytes.push((level << 4) | 15);
      let rest = run - 16;
      do {
        bytes.push((rest & 0x7f) | (rest > 0x7f ? 0x80 : 0));
        rest >>>= 7;
      } while (rest > 0);
    }
    i += run;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return btoa(binary);
}

export function decodePaint(data) {
  let binary;
  try {
    binary = atob(data);
  } catch {
    throw new Error('Vegetation paint is not valid base64.');
  }
  const levels = new Uint8Array(PAINT_SIZE * PAINT_SIZE);
  let filled = 0;
  for (let i = 0; i < binary.length;) {
    const header = binary.charCodeAt(i++);
    let run = (header & 15) + 1;
    if ((header & 15) === 15) {
      let rest = 0;
      let shift = 0;
      let byte;
      do {
        if (i >= binary.length || shift > 21) {
          throw new Error('Vegetation paint is damaged.');
        }
        byte = binary.charCodeAt(i++);
        rest |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);
      run = rest + 16;
    }
    if (filled + run > levels.length) {
      throw new Error('Vegetation paint is damaged.');
    }
    levels.fill(header >> 4, filled, filled + run);
    filled += run;
  }
  if (filled !== levels.length) {
    throw new Error('Vegetation paint is damaged.');
  }
  return levels;
}

// Brush modes and the level each paints towards.
export const BRUSH_TARGETS = Object.freeze({ plant: 15, clear: 0, restore: NEUTRAL });

// One dab of the brush at texel (x, y) with a radius in texels: full strength out to 70% of
// the radius, fading to nothing at its edge. Returns whether anything changed.
export function paintDab(levels, x, y, radius, mode) {
  const target = BRUSH_TARGETS[mode];
  let changed = false;
  const x0 = Math.max(0, Math.floor(x - radius));
  const x1 = Math.min(PAINT_SIZE - 1, Math.ceil(x + radius));
  const y0 = Math.max(0, Math.floor(y - radius));
  const y1 = Math.min(PAINT_SIZE - 1, Math.ceil(y + radius));
  for (let row = y0; row <= y1; row++) {
    for (let column = x0; column <= x1; column++) {
      const distance = Math.hypot(column + 0.5 - x, row + 0.5 - y) / Math.max(radius, 0.5);
      if (distance >= 1) {
        continue;
      }
      const weight = distance <= 0.7 ? 1 : 1 - (distance - 0.7) / 0.3;
      const index = row * PAINT_SIZE + column;
      const level = Math.round(levels[index] + (target - levels[index]) * weight);
      if (level !== levels[index]) {
        levels[index] = level;
        changed = true;
      }
    }
  }
  return changed;
}

// The paint texel under world (x, z), given the near tile's origin and extent in metres.
export function paintTexel(x, z, origin, extent) {
  return [(x - origin[0]) / extent * PAINT_SIZE, (z - origin[1]) / extent * PAINT_SIZE];
}
