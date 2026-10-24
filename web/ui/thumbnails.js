// SPDX-License-Identifier: Apache-2.0
// Gallery thumbnails: small renders of variant scenes by the real renderer, cached by scene
// so a gallery reopens instantly until the view or the scene changes.

import { aspectOf } from '../scene/document.js';

const CACHE_LIMIT = 120;
// Thumbnails fit this box (twice a gallery tile) in the scene's image shape.
const BOX = [288, 162];

function fitBox(aspect) {
  const width = Math.min(BOX[0], Math.round(BOX[1] * aspect));
  return { width, height: Math.round(width / aspect) };
}

export class Thumbnails {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
  }

  // Title and saved views don't change the picture.
  key(scene) {
    return JSON.stringify({ ...scene, title: null, cameras: null });
  }

  get(scene) {
    return this.cache.get(this.key(scene));
  }

  // Renders the scenes that aren't cached yet. Resolves to false if the renderer was busy
  // (building terrain or exporting), so the caller can try again later.
  async render(scenes) {
    const missing = scenes.filter(scene => !this.cache.has(this.key(scene)));
    if (missing.length === 0) {
      return true;
    }
    const blobs = await this.renderer.renderVariants(missing, fitBox(aspectOf(missing[0])));
    if (!blobs) {
      return false;
    }
    missing.forEach((scene, index) => {
      if (blobs[index]) {
        this.store(this.key(scene), URL.createObjectURL(blobs[index]));
      }
    });
    return true;
  }

  store(key, url) {
    this.cache.set(key, url);
    while (this.cache.size > CACHE_LIMIT) {
      const [oldest, oldUrl] = this.cache.entries().next().value;
      URL.revokeObjectURL(oldUrl);
      this.cache.delete(oldest);
    }
  }
}
