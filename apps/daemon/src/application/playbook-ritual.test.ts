import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FsPlaybookRegistry } from '../adapters/fs-playbooks/fs-playbook-registry.js';
import { FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import { InMemoryAppRepository, InMemoryEpicRepository, InMemoryTaskRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { DomainError } from '../domain/errors.js';
import { Catalog } from './catalog.js';
import { PlaybookRitual } from './playbook-ritual.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../playbooks', import.meta.url));
const skills = { skills: () => [
  { name: 'spec', playbook: 'task', researched: '2026-08-01' },
  { name: 'retro', playbook: 'task', researched: '2026-09-25' },
] };

let apps: InMemoryAppRepository;
let epics: InMemoryEpicRepository;
let tasks: InMemoryTaskRepository;
let ritual: PlaybookRitual;

beforeEach(() => {
  apps = new InMemoryAppRepository();
  epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  const clock = new FixedClock('2026-09-25T10:00:00.000Z');
  const catalog = new Catalog({ apps, epics, tasks, playbooks: new FsPlaybookRegistry(PLAYBOOKS), clock, ids: new SequentialIds(), bus: new RecordingBus() });
  ritual = new PlaybookRitual({ skills, apps, epics, tasks, catalog, clock, playbooksRepo: '/home/me/terminus' });
});

describe('PlaybookRitual', () => {
  it('lists skills oldest research first and flags those older than a month', () => {
    expect(ritual.list()).toEqual([
      { name: 'spec', playbook: 'task', researched: '2026-08-01', stale: true },
      { name: 'retro', playbook: 'task', researched: '2026-09-25', stale: false },
    ]);
  });

  it('opens one update station per skill on the Playbooks line of the app holding the playbooks', () => {
    expect(() => ritual.update('spec')).toThrow(/Adopt the repository/);
    apps.save({ id: 'terminus', name: 'terminus', repoPath: '/home/me/terminus/', verification: [], createdAt: 'x' });

    const { app, task } = ritual.update('spec');

    expect(app.id).toBe('terminus');
    expect(epics.listByApp('terminus')).toEqual([expect.objectContaining({ code: 'PB', name: 'Playbooks' })]);
    expect(task).toMatchObject({ title: 'Mettre à jour la skill spec', description: 'Skill playbooks/task/skills/spec/, recherchée le 2026-08-01.' });
    expect(task.lifecycle.phases.map((phase) => phase.id)).toEqual(['research', 'execute', 'verify', 'review', 'sync', 'merge']);
    expect(() => ritual.update('spec')).toThrow(/already has an update in progress/);
    expect(() => ritual.update('ghost')).toThrow(DomainError);
    ritual.update('retro');
    expect(epics.listByApp('terminus')).toHaveLength(1);
  });
});
