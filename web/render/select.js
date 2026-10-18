// SPDX-License-Identifier: Apache-2.0
// Factories create fresh canvases and release partial resources on failure.
export async function selectRenderer(preference, factories, initialReasons = []) {
  const reasons = [...initialReasons];
  const order = preference === 'none' ? [] : preference === 'webgl2' ? ['webgl2'] : ['webgpu', 'webgl2'];
  for (const kind of order) {
    try { return { renderer: await factories[kind](), kind, reasons }; }
    catch (error) { reasons.push(`${kind}: ${error.message || error}`); }
  }
  return { renderer: null, kind: 'none', reasons };
}
