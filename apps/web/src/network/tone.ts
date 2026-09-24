import type { TaskStatusDto } from '@terminus/contracts';

export type Tone = 'done' | 'todo' | 'go' | 'signal' | 'stop' | 'idle';

export function toneOf(status: TaskStatusDto): Tone {
  switch (status.kind) {
    case 'done':
      return 'done';
    case 'todo':
      return 'todo';
    case 'running':
      return 'go';
    case 'awaiting-decision':
    case 'awaiting-gate':
      return 'signal';
    case 'blocked':
      return 'stop';
    case 'ready':
    case 'manual':
      return 'idle';
  }
}

export function statusKey(status: TaskStatusDto): string {
  return status.kind === 'awaiting-gate' ? `status.gate.${status.gate}` : `status.${status.kind}`;
}

export const isActive = (status: TaskStatusDto): boolean => status.kind !== 'done' && status.kind !== 'todo';
