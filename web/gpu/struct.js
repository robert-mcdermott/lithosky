// SPDX-License-Identifier: Apache-2.0
// Writes uniform structs word by word. Field order must match the WGSL struct, and the
// structs are laid out so that every vec2 starts on an even word and every vec3 on a
// multiple of four words.

export class StructWriter {
  constructor(bytes) {
    this.buffer = new ArrayBuffer(bytes);
    this.floats = new Float32Array(this.buffer);
    this.uints = new Uint32Array(this.buffer);
    this.word = 0;
  }

  f32(...values) {
    for (const value of values) {
      this.floats[this.word++] = value;
    }
    return this;
  }

  u32(...values) {
    for (const value of values) {
      this.uints[this.word++] = value >>> 0;
    }
    return this;
  }
}
