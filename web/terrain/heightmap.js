// SPDX-License-Identifier: Apache-2.0
// Imports a 16-bit grayscale PNG heightmap (or a Lithosky .heightmap bundle) through the
// local server, which validates and decodes it, and returns normalized samples for
// Terrain.setHeightmap().

const SIZES = [129, 257, 513, 1025, 2049];
const MAX_BYTES = 20 * 1024 * 1024;

async function sessionToken() {
  const response = await fetch('/api/session');
  if (!response.ok) {
    throw new Error('Could not start a local session for heightmap import.');
  }
  return (await response.json()).token;
}

// Reads the width from a PNG header; bundles carry their own scale metadata.
function pngSize(bytes) {
  const isPng = bytes[0] === 137 && bytes[1] === 80;
  if (!isPng || bytes.byteLength < 24) {
    return null;
  }
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(16, false);
}

// Big-endian unsigned 16-bit samples -> Float32Array in 0..1.
export function normalizeSamples(raw) {
  if (raw.byteLength % 2 !== 0) {
    throw new Error('Height samples must be 16-bit.');
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const samples = new Float32Array(raw.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getUint16(i * 2, false) / 65535;
  }
  return samples;
}

export async function importHeightmap(file) {
  if (file.size > MAX_BYTES) {
    throw new Error('Heightmaps are limited to 20 MiB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = pngSize(bytes);
  if (size !== null && !SIZES.includes(size)) {
    throw new Error(`PNG heightmaps must be ${SIZES.join(', ')} pixels square.`);
  }
  const scale = {
    format: 'lithosky-heightmap',
    version: 1,
    resolution: (size ?? 129) - 1,
    minimum: 0,
    maximum: 1,
    metersPerUnit: 1,
    elevation: 1,
    rowOrder: 'z-increasing',
  };
  const token = await sessionToken();
  const imported = await fetch('/api/heightmap/import', {
    method: 'POST',
    body: bytes,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Lithosky-Session': token,
      'X-Lithosky-Scale': JSON.stringify(scale),
    },
  });
  if (!imported.ok) {
    throw new Error((await imported.text()).trim() || 'The heightmap could not be imported.');
  }
  const { asset, scale: stored } = await imported.json();
  const response = await fetch(`/api/heightmaps/${asset}`, { headers: { 'X-Lithosky-Session': token } });
  if (!response.ok) {
    throw new Error('The imported heightmap could not be read back.');
  }
  const samples = normalizeSamples(new Uint8Array(await response.arrayBuffer()));
  const side = stored.resolution + 1;
  if (samples.length !== side * side) {
    throw new Error('Heightmap sample count does not match its size.');
  }
  return { size: side, samples };
}
