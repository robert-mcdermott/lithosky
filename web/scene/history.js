// SPDX-License-Identifier: Apache-2.0
// Undo/redo over validated scene snapshots. A drag or slider gesture is one transaction:
// begin() before the first change, end() after the last, and the whole gesture undoes at once.
// Snapshots are JSON strings, budgeted at two bytes per character.

export const HISTORY_BYTES = 4 * 1024 * 1024;

export class History {
  constructor(scene, validate, limit = 100, maxBytes = HISTORY_BYTES) {
    this.validate = validate;
    this.current = validate(scene);
    this.limit = limit;
    this.maxBytes = maxBytes;
    this.past = [];
    this.future = [];
    // While a gesture runs, `base` holds the scene from before it started.
    this.base = null;
    this.baseFuture = null;
  }

  get value() {
    return structuredClone(this.current);
  }

  snapshot() {
    return JSON.stringify(this.current);
  }

  get snapshotBytes() {
    const pending = this.baseFuture && this.baseFuture !== this.future ? this.baseFuture : [];
    const base = this.base === null ? [] : [this.base];
    return [...this.past, ...this.future, ...pending, ...base].reduce((total, s) => total + s.length * 2, 0);
  }

  get canUndo() {
    return this.past.length > 0 || (this.base !== null && this.base !== this.snapshot());
  }

  get canRedo() {
    return this.future.length > 0;
  }

  // Drops the oldest snapshots until both the count and byte budgets hold.
  trim() {
    const pendingCount = () => (this.baseFuture && this.baseFuture !== this.future ? this.baseFuture.length : 0);
    while (this.past.length + this.future.length + pendingCount() > this.limit || this.snapshotBytes > this.maxBytes) {
      if (this.past.length) {
        this.past.shift();
      } else if (this.future.length) {
        this.future.shift();
      } else if (this.baseFuture?.length) {
        this.baseFuture.shift();
      } else {
        break;
      }
    }
  }

  begin() {
    if (this.base !== null) {
      return;
    }
    const snapshot = this.snapshot();
    if (snapshot.length * 2 > this.maxBytes) {
      throw new Error('Scene exceeds the history snapshot budget.');
    }
    this.base = snapshot;
    this.baseFuture = this.future;
    this.trim();
  }

  // Applies `change(draft)`. Returns false when the result equals the current scene.
  edit(change) {
    const candidate = this.value;
    change(candidate);
    const next = this.validate(candidate);
    if (JSON.stringify(next) === this.snapshot()) {
      return false;
    }
    this.future = [];
    if (this.base === null) {
      this.push(this.snapshot());
    }
    this.current = next;
    return true;
  }

  replace(scene) {
    const next = this.validate(scene);
    return this.edit(draft => {
      for (const key of Object.keys(draft)) {
        delete draft[key];
      }
      Object.assign(draft, next);
    });
  }

  push(snapshot) {
    this.past.push(snapshot);
    this.trim();
  }

  end() {
    const base = this.base;
    this.base = null;
    this.baseFuture = null;
    if (base !== null && base !== this.snapshot()) {
      this.push(base);
    }
  }

  // Abandons the running gesture and restores the scene from before it.
  cancel() {
    if (this.base === null) {
      return false;
    }
    const changed = this.base !== this.snapshot();
    this.current = JSON.parse(this.base);
    this.future = this.baseFuture ?? [];
    this.base = null;
    this.baseFuture = null;
    this.trim();
    return changed;
  }

  undo() {
    this.end();
    if (!this.past.length) {
      return false;
    }
    const previous = this.past.pop();
    this.future.push(this.snapshot());
    this.current = JSON.parse(previous);
    this.trim();
    return true;
  }

  redo() {
    this.end();
    if (!this.future.length) {
      return false;
    }
    const next = this.future.pop();
    this.push(this.snapshot());
    this.current = JSON.parse(next);
    return true;
  }
}
