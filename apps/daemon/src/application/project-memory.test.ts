import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, SequentialIds } from '../adapters/in-memory/fakes.js';
import { InMemoryAppRepository, InMemoryMemoryRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { DomainError } from '../domain/errors.js';
import { ProjectMemory } from './project-memory.js';

let memory: ProjectMemory;

beforeEach(() => {
  const apps = new InMemoryAppRepository();
  apps.save({ id: 'app', name: 'demo', repoPath: '/repo', verification: [], createdAt: 'x' });
  memory = new ProjectMemory({ apps, memory: new InMemoryMemoryRepository(), context: { forApp: (app) => `pack of ${app.name}` }, clock: new FixedClock(), ids: new SequentialIds() });
});

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
});
