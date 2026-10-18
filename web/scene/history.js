// SPDX-License-Identifier: Apache-2.0
export const HISTORY_BYTES = 4 * 1024 * 1024;
// Snapshots are strings, accounted conservatively as two bytes per code unit.
// Dense heightfields never enter history; the worker deterministically replays edits.
export class History {
  constructor(scene, validate, limit = 100, maxBytes = HISTORY_BYTES) {
    this.validate = validate; this.current = validate(scene); this.limit = limit; this.maxBytes = maxBytes;
    this.past = []; this.future = []; this.base = null;
  }
  get value() { return structuredClone(this.current); }
  snapshot() { return JSON.stringify(this.current); }
  get snapshotBytes() { return [...this.past, ...this.future, ...(this.base === null ? [] : [this.base])].reduce((n,s)=>n+s.length*2,0); }
  get canUndo() { return this.past.length > 0 || (this.base !== null && this.base !== this.snapshot()); }
  get canRedo() { return this.future.length > 0; }
  trim() {
    while (this.past.length + this.future.length > this.limit || this.snapshotBytes > this.maxBytes) {
      if (this.past.length) this.past.shift();
      else if (this.future.length) this.future.shift();
      else break;
    }
  }
  begin() {
    if (this.base !== null) return;
    const snapshot=this.snapshot();
    if (snapshot.length*2>this.maxBytes) throw new Error('Scene exceeds the history snapshot budget.');
    this.base=snapshot;this.trim();
  }
  edit(change) {
    const candidate=this.value;change(candidate);
    const next=this.validate(candidate);
    if(JSON.stringify(next)===this.snapshot())return false;
    this.future=[];
    if(this.base===null)this.push(this.snapshot());
    this.current=next;return true;
  }
  replace(scene) { const next=this.validate(scene);return this.edit(doc=>{for(const key of Object.keys(doc))delete doc[key];Object.assign(doc,next);}); }
  push(snapshot) { this.past.push(snapshot);this.trim(); }
  end() {
    const base=this.base;this.base=null;
    if(base!==null && base!==this.snapshot())this.push(base);
  }
  undo() { this.end();if(!this.past.length)return false;const next=this.past.pop();this.future.push(this.snapshot());this.current=JSON.parse(next);this.trim();return true; }
  redo() { this.end();if(!this.future.length)return false;const next=this.future.pop();this.push(this.snapshot());this.current=JSON.parse(next);return true; }
}
