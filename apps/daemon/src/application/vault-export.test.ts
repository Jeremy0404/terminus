import { beforeEach, describe, expect, it } from 'vitest';
import { FakeTaskNotes, FixedClock } from '../adapters/in-memory/fakes.js';
import type { App } from '../domain/app.js';
import { createTask } from '../domain/task.js';
import { TASK_LIFECYCLE } from '../domain/test-fixtures.js';
import type { Vault, VaultNote } from './ports/vault.js';
import { VaultExport } from './vault-export.js';

class MemoryVault implements Vault {
  readonly files = new Map<string, string>();
  readonly commits: { message: string; paths: string[] }[] = [];

  read(path: string): string | null {
    return this.files.get(path) ?? null;
  }

  list(directory: string): string[] {
    return [...this.files.keys()].filter((path) => path.startsWith(`${directory}/`));
  }

  write(notes: readonly VaultNote[], message: string): void {
    for (const note of notes) this.files.set(note.path, note.content);
    this.commits.push({ message, paths: notes.map((note) => note.path) });
  }
}

const app: App = { id: 'app', name: 'Carnet Vélo', repoPath: '/p/carnet-velo', verification: [], createdAt: 'x' };
const task = createTask({ id: 'task-1', epicId: 'e', title: 'Add the rides list', lifecycle: TASK_LIFECYCLE });
let vault: MemoryVault;
let notes: FakeTaskNotes;
let errors: unknown[];
let exporter: VaultExport;

beforeEach(() => {
  vault = new MemoryVault();
  notes = new FakeTaskNotes();
  errors = [];
  exporter = new VaultExport({ vault, notes, clock: new FixedClock('2026-09-25T10:00:00.000Z'), onError: (error) => errors.push(error) });
});

describe('VaultExport', () => {
  it('exports the approved brief with a project card when the vault has none', () => {
    exporter.briefApproved(app, '# Carnet\n\n## Problème\n\nJe perds mes sorties.');

    expect(vault.commits).toEqual([{ message: 'Export the Carnet Vélo brief from Terminus', paths: ['Projects/carnet-velo.md', 'Projects/carnet-velo/product/brief.md'] }]);
    expect(vault.read('Projects/carnet-velo.md')).toContain('type: project\nstatus: active\nstarted: 2026-09-25');
    expect(vault.read('Projects/carnet-velo.md')).toContain('## Outcome\n\nJe perds mes sorties.');
    expect(vault.read('Projects/carnet-velo/product/brief.md')).toBe(
      '---\ntype: product-brief\nproject: carnet-velo\nstatus: approved\nupdated: 2026-09-25\ntags: [product, brief]\n---\n\n# Carnet\n\n## Problème\n\nJe perds mes sorties.\n\n## Links\n\n- [[Projects/carnet-velo|Carnet Vélo]]\n',
    );

    exporter.briefApproved(app, '# Carnet v2');
    expect(vault.commits[1]?.paths).toEqual(['Projects/carnet-velo/product/brief.md']);
  });

  it('exports each architecture record as an English ADR and lists it in the decision index', () => {
    const record = { slug: 'use-postgresql', title: 'Use PostgreSQL', context: 'Rides are relational.', decision: 'We store rides in PostgreSQL.', consequences: 'A database container runs next to the app.' };
    exporter.stackApproved(app, [record], task);

    const adr = vault.read('Projects/carnet-velo/decisions/2026-09-25-use-postgresql.md');
    expect(adr).toContain('type: decision\nstatus: accepted\nproject: carnet-velo\ndate: 2026-09-25');
    expect(adr).toContain('# Use PostgreSQL\n\n## Context\n\nRides are relational.\n\n## Decision\n\nWe store rides in PostgreSQL.\n\n## Consequences\n\nA database container runs next to the app.');
    expect(vault.read('Projects/carnet-velo/decisions/index.md')).toContain('| Decision | Status | Source |\n|---|---|---|\n| Use PostgreSQL | accepted | [[2026-09-25-use-postgresql]] |\n');

    exporter.stackApproved(app, [{ ...record, slug: 'serve-with-nginx', title: 'Serve with nginx' }], task);
    expect(vault.read('Projects/carnet-velo/decisions/index.md')).toContain('| Use PostgreSQL | accepted | [[2026-09-25-use-postgresql]] |\n| Serve with nginx | accepted | [[2026-09-25-serve-with-nginx]] |');
  });

  it('exports an approved plan and marks it done once the task is merged', () => {
    notes.files.set('task-1/plan.md', '# Plan\n\n1. Add the table.\n2. Add the screen.');

    exporter.planApproved(app, task);
    const path = 'Projects/carnet-velo/active/plan-2026-09-25-add-the-rides-list.md';
    expect(vault.read(path)).toContain('type: plan\nstatus: active\nproject: carnet-velo\ncreated: 2026-09-25\nupdated: 2026-09-25\ntags: [plan]\nterminus-task: task-1');
    expect(vault.read(path)).toContain('# Add the rides list\n\n1. Add the table.');

    exporter.taskMerged(app, task);
    expect(vault.read(path)).toContain('status: done');
  });

  it('reports a failure instead of stopping the gate', () => {
    const broken: Vault = { read: () => null, list: () => [], write: () => { throw new Error('disk full'); } };
    new VaultExport({ vault: broken, notes, clock: new FixedClock(), onError: (error) => errors.push(error) }).briefApproved(app, 'x');
    expect(errors).toEqual([new Error('disk full')]);
  });
});
