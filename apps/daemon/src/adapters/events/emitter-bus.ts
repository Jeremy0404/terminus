import { EventEmitter } from 'node:events';
import type { RunEventBus, RunUpdate } from '../../application/ports/system.js';

const UPDATE = 'update';

export class EmitterBus implements RunEventBus {
  private readonly emitter = new EventEmitter().setMaxListeners(100);

  publish(update: RunUpdate): void {
    this.emitter.emit(UPDATE, update);
  }

  subscribe(listener: (update: RunUpdate) => void): () => void {
    this.emitter.on(UPDATE, listener);
    return () => this.emitter.off(UPDATE, listener);
  }
}
