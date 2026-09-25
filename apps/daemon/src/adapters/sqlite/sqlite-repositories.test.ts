import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../domain/app.js';
import type { Decision } from '../../domain/decision.js';
import type { Epic } from '../../domain/epic.js';
import type { Run } from '../../domain/run.js';
import { createTask, type Task } from '../../domain/task.js';
import { checkpoint, failure, TASK_LIFECYCLE } from '../../domain/test-fixtures.js';
import { openDatabase, type TerminusDatabase } from './database.js';
import {
  SqliteAgentDefaultsStore,
  SqliteAppRepository,
  SqliteDecisionRepository,
  SqliteEpicRepository,
  SqliteQuotaStore,
  SqliteRunRepository,
  SqliteTaskRepository,
} from './sqlite-repositories.js';

const app: App = { id: 'terminus', name: 'terminus', repoPath: '/home/me/dev/terminus', verification: [{ name: 'test', command: 'pnpm test' }], createdAt: '2026-09-24T09:00:00Z' };
const epic: Epic = { id: 'e-interface', appId: 'terminus', code: 'I', name: 'Interface', status: 'active', position: 3, description: '', breakdown: { status: 'idle' } };

let directory: string;
let db: TerminusDatabase;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'terminus-db-'));
  db = openDatabase(join(directory, 'terminus.db'));
  new SqliteAppRepository(db).save(app);
  new SqliteEpicRepository(db).save(epic);
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function task(id: string, extra: Partial<Task> = {}): Task {
  return { ...createTask({ id, epicId: epic.id, title: `Task ${id}`, lifecycle: TASK_LIFECYCLE }), ...extra };
}

describe('SqliteAppRepository and SqliteEpicRepository', () => {
  it('round-trips apps and epics, and updates in place', () => {
    const apps = new SqliteAppRepository(db);
    const epics = new SqliteEpicRepository(db);
    epics.save({ ...epic, status: 'delivered' });
    epics.save({ ...epic, id: 'e-engine', code: 'M', name: 'Engine', position: 1 });

    expect(apps.get('terminus')).toEqual(app);
    expect(apps.list()).toEqual([app]);
    expect(epics.get('e-interface')?.status).toBe('delivered');
    expect(epics.listByApp('terminus').map((e) => e.code)).toEqual(['M', 'I']);
    expect(apps.get('missing')).toBeNull();
  });
});

describe('SqliteTaskRepository', () => {
  it('round-trips a whole task aggregate', () => {
    const tasks = new SqliteTaskRepository(db);
    tasks.save(task('t0', { status: { kind: 'done' } }));
    const saved = task('t1', {
      description: 'Zoom on the map\nwith the wheel',
      autonomy: 'up-to-merge',
      agent: { model: 'sonnet', effort: 'low' },
      dependsOn: ['t0'],
      phaseIndex: 4,
      status: { kind: 'blocked', failure: failure() },
      failuresInPhase: [failure(), failure()],
      checkFailures: [failure('check-failed', 'check:build')],
      checkpoints: [checkpoint(1, 0), checkpoint(2, 1)],
    });

    tasks.save(saved);

    expect(tasks.get('t1')).toEqual(saved);
    expect(tasks.get('t0')?.description).toBe('');
  });

  it('replaces dependencies and checkpoints on save', () => {
    const tasks = new SqliteTaskRepository(db);
    tasks.save(task('a'));
    tasks.save(task('b'));
    tasks.save(task('t', { dependsOn: ['a', 'b'], checkpoints: [checkpoint(1, 0), checkpoint(2, 1)] }));
    tasks.save(task('t', { dependsOn: ['b'], checkpoints: [checkpoint(1, 0)] }));

    const reloaded = tasks.get('t');
    expect(reloaded?.dependsOn).toEqual(['b']);
    expect(reloaded?.checkpoints).toEqual([checkpoint(1, 0)]);
  });

  it('keeps the playbook version a task started with', () => {
    const tasks = new SqliteTaskRepository(db);
    const newer = { ...TASK_LIFECYCLE, version: 'newer', phases: [{ id: 'only' }] };
    tasks.save(task('old'));
    tasks.save({ ...task('new'), lifecycle: newer });

    expect(tasks.get('old')?.lifecycle).toEqual(TASK_LIFECYCLE);
    expect(tasks.get('new')?.lifecycle).toEqual(newer);
  });

  it('lists tasks by epic and by app in creation order, even after updates', () => {
    const tasks = new SqliteTaskRepository(db);
    tasks.save(task('b'));
    tasks.save(task('a'));
    tasks.save(task('b', { title: 'renamed' }));

    expect(tasks.listByEpic(epic.id).map((t) => t.id)).toEqual(['b', 'a']);
    expect(tasks.listByApp('terminus').map((t) => t.id)).toEqual(['b', 'a']);
    expect(tasks.listByApp('other')).toEqual([]);
  });

  it('refuses a dependency on an unknown task', () => {
    expect(() => new SqliteTaskRepository(db).save(task('t', { dependsOn: ['ghost'] }))).toThrow();
  });
});

describe('SqliteRunRepository and SqliteDecisionRepository', () => {
  beforeEach(() => new SqliteTaskRepository(db).save(task('t1')));

  it('round-trips runs with and without usage and model', () => {
    const runs = new SqliteRunRepository(db);
    const running: Run = { id: 'r1', taskId: 't1', phaseIndex: 3, sessionId: 's1', status: 'running', startedAt: '2026-09-24T10:00:00Z', endedAt: null, usage: null, output: null };
    const finished: Run = {
      ...running,
      status: 'succeeded',
      endedAt: '2026-09-24T10:14:00Z',
      usage: { inputTokens: 150_000, outputTokens: 32_000 },
      output: { verdict: 'approve' },
      agent: { model: 'opus', effort: null },
    };

    runs.save(running);
    expect(runs.get('r1')).toEqual(running);
    runs.save(finished);
    expect(runs.listByTask('t1')).toEqual([finished]);
  });

  it('round-trips decisions and their answers', () => {
    const decisions = new SqliteDecisionRepository(db);
    const open: Decision = {
      id: 'd1',
      kind: 'question',
      taskId: 't1',
      phaseIndex: 1,
      question: 'Where do phase definitions live?',
      options: [
        { label: 'YAML files', description: 'Readable and versioned', recommended: true },
        { label: 'SQLite rows', description: 'Editable in the app', recommended: false },
      ],
      answer: null,
      createdAt: '2026-09-24T10:00:00Z',
      answeredAt: null,
    };

    decisions.save(open);
    expect(decisions.get('d1')).toEqual(open);
    const answered: Decision = { ...open, answer: { kind: 'other', text: 'Both' }, answeredAt: '2026-09-24T10:05:00Z' };
    decisions.save(answered);
    expect(decisions.listByTask('t1')).toEqual([answered]);
  });
});

describe('SqliteQuotaStore', () => {
  it('keeps only the latest quota', () => {
    const store = new SqliteQuotaStore(db);
    expect(store.latest()).toBeNull();

    store.save({ limited: false, windows: [{ kind: 'five-hour', utilization: 0.2, resetsAt: '2026-09-24T12:00:00.000Z' }], observedAt: '2026-09-24T10:00:00.000Z' });
    const latest = { limited: true, windows: [{ kind: 'five-hour', utilization: 1, resetsAt: '2026-09-24T12:00:00.000Z' }], observedAt: '2026-09-24T11:00:00.000Z' };
    store.save(latest);

    expect(store.latest()).toEqual(latest);
  });
});

describe('SqliteAgentDefaultsStore', () => {
  it('replaces the defaults per phase as a whole', () => {
    const store = new SqliteAgentDefaultsStore(db);
    expect(store.all()).toEqual({});

    store.replace({ spec: { model: 'sonnet', effort: null }, execute: { model: 'opus', effort: 'high' } });
    store.replace({ execute: { model: null, effort: 'max' } });

    expect(store.all()).toEqual({ execute: { model: null, effort: 'max' } });
  });
});
