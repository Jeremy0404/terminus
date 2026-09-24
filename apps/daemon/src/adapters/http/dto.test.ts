import { describe, expect, it } from 'vitest';
import { createTask } from '../../domain/task.js';
import { TASK_LIFECYCLE } from '../../domain/test-fixtures.js';
import type { RunUpdate } from '../../application/ports/system.js';
import { toServerEventDto } from './dto.js';

describe('toServerEventDto', () => {
  it('maps task-changed', () => {
    const task = createTask({ id: 't1', epicId: 'epic', title: 'Zoom to platform', lifecycle: TASK_LIFECYCLE });
    const update: RunUpdate = { kind: 'task-changed', task };

    expect(toServerEventDto(update)).toEqual({ type: 'task-changed', task: expect.objectContaining({ id: 't1', title: 'Zoom to platform' }) });
  });

  it('maps run-event', () => {
    const update: RunUpdate = { kind: 'run-event', runId: 'run-1', taskId: 't1', event: { type: 'text', text: 'hi' } };

    expect(toServerEventDto(update)).toEqual({ type: 'run-event', runId: 'run-1', taskId: 't1', event: { type: 'text', text: 'hi' } });
  });

  it('maps check-result', () => {
    const result = { name: 'test', command: 'pnpm test', ok: true, exitCode: 0, outputTail: '', durationMs: 5 };
    const update: RunUpdate = { kind: 'check-result', runId: 'run-1', taskId: 't1', result };

    expect(toServerEventDto(update)).toEqual({ type: 'check-result', runId: 'run-1', taskId: 't1', result });
  });

  it('maps check-started', () => {
    const update: RunUpdate = { kind: 'check-started', runId: 'run-1', taskId: 't1', name: 'test', command: 'pnpm test' };

    expect(toServerEventDto(update)).toEqual({ type: 'check-started', runId: 'run-1', taskId: 't1', name: 'test', command: 'pnpm test' });
  });

  it('maps check-output', () => {
    const update: RunUpdate = { kind: 'check-output', runId: 'run-1', taskId: 't1', name: 'test', command: 'pnpm test', outputTail: 'partial…' };

    expect(toServerEventDto(update)).toEqual({ type: 'check-output', runId: 'run-1', taskId: 't1', name: 'test', command: 'pnpm test', outputTail: 'partial…' });
  });
});
