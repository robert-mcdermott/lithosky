// SPDX-License-Identifier: Apache-2.0
// One job at a time. Termination stops expensive work and drops its dense cache;
// request identity also protects against messages already queued before termination.
export class TerrainGenerator {
  constructor(makeWorker = () => new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' })) {
    this.makeWorker=makeWorker;this.serial=0;
  }
  cancel() {
    this.serial++;this.worker?.terminate();this.worker=null;
    this.pending?.reject(new DOMException('Terrain generation canceled.', 'AbortError'));this.pending=null;
  }
  generate(state, onProgress = () => {}, action = 'build', resolution = 128) {
    if(this.pending) this.cancel();
    const id=++this.serial;
    return new Promise((resolve,reject)=>{
      this.pending={reject};
      try {
        this.worker ??= this.makeWorker();
        const failed=error=>{if(id!==this.serial)return;this.pending=null;this.worker?.terminate();this.worker=null;reject(error);};
        this.worker.onerror=event=>{event.preventDefault?.();failed(new Error(event.message || 'Terrain worker failed.'));};
        this.worker.onmessageerror=()=>failed(new Error('Cannot read terrain worker result.'));
        this.worker.onmessage=({data})=>{
          if(id!==this.serial || data.id!==id)return;
          if(data.error) {failed(new Error(data.error));return;}
          if(data.result) {this.pending=null;resolve(data.result);} else onProgress(data.progress);
        };
        this.worker.postMessage({id,state:structuredClone(state),action,resolution});
      } catch(error) { this.pending=null;this.worker?.terminate();this.worker=null;reject(error); }
    });
  }
}
