// SPDX-License-Identifier: Apache-2.0
// Debounced recovery saves, one request at a time. A failed save is retried before any newer
// queued scene, so an uncertain response can never let an older snapshot overwrite a newer one.

export class Autosave {
  // `save(scene, revision)` resolves to the new revision; `status(kind, detail)` reports
  // 'pending', 'saving', 'saved' or 'error'.
  constructor(save, revision, status, delay = 650) {
    this.save = save;
    this.revision = revision;
    this.status = status;
    this.delay = delay;
    this.pending = null;
    this.failed = null;
    this.running = null;
    this.timer = null;
    this.blocked = false;
    this.lastSaved = null;
  }

  get unsaved() {
    return Boolean(this.pending || this.failed || this.running);
  }

  enqueue(scene) {
    const text = JSON.stringify(scene);
    clearTimeout(this.timer);
    if (!this.running && !this.failed && text === this.lastSaved) {
      this.pending = null;
      this.status('saved');
      return;
    }
    this.pending = { scene: structuredClone(scene), text };
    if (this.blocked) {
      return;
    }
    this.status('pending');
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  flush() {
    clearTimeout(this.timer);
    if (this.running) {
      return this.running;
    }
    if (this.blocked || (!this.pending && !this.failed)) {
      return Promise.resolve();
    }
    const sent = this.failed || this.pending;
    if (!this.failed) {
      this.pending = null;
    }
    this.failed = null;
    this.status('saving');
    this.running = Promise.resolve()
      .then(() => this.save(sent.scene, this.revision))
      .then(revision => {
        this.revision = revision;
        this.lastSaved = sent.text;
        this.status(this.pending ? 'pending' : 'saved');
      })
      .catch(error => {
        this.failed = sent;
        this.blocked = true;
        this.status('error', error.message);
      })
      .finally(() => {
        this.running = null;
        if (this.pending && !this.blocked) {
          void this.flush();
        }
      });
    return this.running;
  }

  retry() {
    this.blocked = false;
    return this.flush();
  }
}
