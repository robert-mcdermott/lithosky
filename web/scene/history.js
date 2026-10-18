// SPDX-License-Identifier: Apache-2.0
export class History {
  constructor(scene, validate, limit = 100) {
    this.validate = validate; this.current = validate(scene); this.limit = limit;
    this.past = []; this.future = []; this.base = null;
  }
  get value() { return structuredClone(this.current); }
  get canUndo() { return this.past.length > 0 || (this.base !== null && JSON.stringify(this.base) !== JSON.stringify(this.current)); }
  get canRedo() { return this.future.length > 0; }
  begin() { if (this.base === null) this.base = this.value; }
  edit(change) {
    const candidate = this.value; change(candidate);
    const next = this.validate(candidate); // Validate before changing history or state.
    if (JSON.stringify(next) === JSON.stringify(this.current)) return false;
    if (this.base === null) this.push(this.value);
    this.current = next; this.future = []; return true;
  }
  replace(scene) { const next = this.validate(scene); return this.edit(doc => { for (const key of Object.keys(doc)) delete doc[key]; Object.assign(doc, next); }); }
  push(scene) { this.past.push(scene); if (this.past.length > this.limit) this.past.shift(); }
  end() {
    if (this.base !== null && JSON.stringify(this.base) !== JSON.stringify(this.current)) this.push(this.base);
    this.base = null;
  }
  undo() { this.end(); if (!this.past.length) return false; this.future.push(this.value); this.current = this.past.pop(); return true; }
  redo() { this.end(); if (!this.future.length) return false; this.push(this.value); this.current = this.future.pop(); return true; }
}
