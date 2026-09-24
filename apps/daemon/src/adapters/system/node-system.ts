import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '../../application/ports/system.js';

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

export class RandomIds implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  uuid(): string {
    return randomUUID();
  }
}
