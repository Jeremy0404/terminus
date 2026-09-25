import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import { InMemoryAppRepository, InMemoryEpicRepository, InMemoryMemoryRepository, InMemoryTaskRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { createTask } from '../domain/task.js';
import { TASK_LIFECYCLE } from '../domain/test-fixtures.js';
import { DomainError } from '../domain/errors.js';
import { ProjectMemory } from './project-memory.js';

let memory: ProjectMemory;
let store: InMemoryMemoryRepository;
let bus: RecordingBus;

beforeEach(() => {
  const apps = new InMemoryAppRepository();
  apps.save({ id: 'app', name: 'demo', repoPath: '/repo', verification: [], createdAt: 'x' });
  const epics = new InMemoryEpicRepository();
  epics.save({ id: 'epic', appId: 'app', code: 'C', name: 'Context', status: 'active', position: 1, description: '', breakdown: { status: 'idle' } });
  const tasks = new InMemoryTaskRepository(epics);
  tasks.save(createTask({ id: 't1', epicId: 'epic', title: 'Build the context pack', lifecycle: TASK_LIFECYCLE }));
  store = new InMemoryMemoryRepository();
  bus = new RecordingBus();
  memory = new ProjectMemory({ apps, tasks, bus, memory: store, context: { forApp: (app) => `pack of ${app.name}` }, clock: new FixedClock(), ids: new SequentialIds() });
});

const proposal = (id: string, proposed: { kind: 'lesson'; text: string } | { kind: 'term'; term: string; definition: string }) =>
  store.saveProposal({ id, appId: 'app', sourceTaskId: 't1', proposed, why: 'Seen during the task', status: 'pending', createdAt: 'x' });

describe('ProjectMemory', () => {
  it('adds and removes lessons, cleaned of extra spaces', () => {
    const lesson = memory.addLesson('app', '  Keep  migrations\nsmall. ');

    expect(memory.view('app').lessons).toEqual([{ id: lesson.id, appId: 'app', text: 'Keep migrations small.', sourceTaskId: null, createdAt: '2026-09-24T10:00:00.000Z' }]);
    memory.removeLesson(lesson.id);
    expect(memory.view('app').lessons).toEqual([]);
  });

  it('updates a term instead of duplicating it, whatever its case', () => {
    const first = memory.setTerm('app', 'Station', 'A task.');
    const second = memory.setTerm('app', 'station', 'A task on a line of the network.');

    expect(second.id).toBe(first.id);
    expect(memory.view('app').terms).toEqual([expect.objectContaining({ term: 'station', definition: 'A task on a line of the network.' })]);
  });

  it('refuses empty text, unknown apps and unknown entries', () => {
    expect(() => memory.addLesson('app', '   ')).toThrow(DomainError);
    expect(() => memory.addLesson('ghost', 'x')).toThrow(DomainError);
    expect(() => memory.removeTerm('term-9')).toThrow(DomainError);
  });

  it('shows the pack agents receive for the app', () => {
    expect(memory.pack('app')).toBe('pack of demo');
  });

  it('turns an accepted proposal into memory and forgets a dismissed one', () => {
    proposal('p1', { kind: 'lesson', text: 'Run the migrations first.' });
    proposal('p2', { kind: 'term', term: 'Station', definition: 'A task on a line.' });
    proposal('p3', { kind: 'lesson', text: 'Not useful.' });
    expect(memory.view('app').proposals.map((entry) => [entry.id, entry.sourceTitle])).toEqual([['p1', 'Build the context pack'], ['p2', 'Build the context pack'], ['p3', 'Build the context pack']]);

    memory.accept('p1');
    memory.accept('p2');
    memory.dismiss('p3');

    const view = memory.view('app');
    expect(view.lessons).toEqual([expect.objectContaining({ text: 'Run the migrations first.', sourceTaskId: 't1' })]);
    expect(view.terms).toEqual([expect.objectContaining({ term: 'Station' })]);
    expect(view.proposals).toEqual([]);
    expect(bus.updates).toHaveLength(3);
    expect(() => memory.accept('p3')).toThrow(/already dismissed/);
  });
});
