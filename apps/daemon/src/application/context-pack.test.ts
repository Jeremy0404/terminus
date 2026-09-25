import { describe, expect, it } from 'vitest';
import { InMemoryMemoryRepository } from '../adapters/in-memory/in-memory-repositories.js';
import type { App } from '../domain/app.js';
import { ContextPack } from './context-pack.js';
import type { RepositoryKnowledge } from './ports/repository-knowledge.js';

const app: App = { id: 'app', name: 'demo', repoPath: '/repo', verification: [], createdAt: 'x' };
const bare: RepositoryKnowledge = { contextDoc: () => null, decisions: () => [] };

describe('ContextPack', () => {
  it('is empty when nothing is known about the project', () => {
    expect(new ContextPack({ memory: new InMemoryMemoryRepository(), knowledge: bare }).forApp(app)).toBe('');
  });

  it('gathers vocabulary, lessons, CONTEXT.md and the index of the repository decisions', () => {
    const memory = new InMemoryMemoryRepository();
    memory.saveTerm({ id: 't1', appId: 'app', term: 'Station', definition: 'A task on a line.', updatedAt: 'x' });
    memory.saveLesson({ id: 'l1', appId: 'app', text: 'Run the migrations before the tests.', sourceTaskId: null, createdAt: '2026-09-25T10:00:00Z' });
    memory.saveLesson({ id: 'other', appId: 'other-app', text: 'Not ours.', sourceTaskId: null, createdAt: '2026-09-25T10:00:00Z' });
    const knowledge: RepositoryKnowledge = { contextDoc: () => '# Context\n\nA line is an epic.\n', decisions: () => [{ path: 'docs/adr/0001-sqlite.md', title: 'Use SQLite' }] };

    expect(new ContextPack({ memory, knowledge }).forApp(app)).toBe(
      [
        '# Project memory (kept in Terminus for demo)',
        '## Vocabulary\n\n- **Station**: A task on a line.',
        '## Lessons from earlier tasks\n\n- Run the migrations before the tests.',
        '## CONTEXT.md from the repository\n\n# Context\n\nA line is an epic.',
        '## Architecture decisions in the repository (read the file before going against one)\n\n- docs/adr/0001-sqlite.md: Use SQLite',
      ].join('\n\n'),
    );
  });

  it('starts with the approved product brief of the app', () => {
    const pack = new ContextPack({ memory: new InMemoryMemoryRepository(), knowledge: bare }).forApp({ ...app, brief: '## Problem\n\nToo many tabs.' });
    expect(pack).toBe('# Project memory (kept in Terminus for demo)\n\n## Product brief (approved)\n\n## Problem\n\nToo many tabs.');
  });

  it('adds the approved stack and its decisions', () => {
    const stack = { id: 'stack-ts-fastify-vue', name: 'Fastify and Vue', decisions: [{ title: 'Accounts', decision: 'None', why: 'Solo use' }] };
    const pack = new ContextPack({ memory: new InMemoryMemoryRepository(), knowledge: bare }).forApp({ ...app, stack });
    expect(pack).toContain('## Stack and architecture (approved)\n\nStack: Fastify and Vue (follow the `stack-ts-fastify-vue` skill)\n- Accounts: None (Solo use)');
  });

  it('points a stack from outside the catalog to its recorded decisions', () => {
    const stack = { id: 'custom-fastapi-htmx', name: 'FastAPI et HTMX', decisions: [{ title: 'Layout', decision: 'app/ and templates/', why: '' }] };
    const pack = new ContextPack({ memory: new InMemoryMemoryRepository(), knowledge: bare }).forApp({ ...app, stack });
    expect(pack).toContain('Stack: FastAPI et HTMX (outside the catalog: follow the decisions below)\n- Layout: app/ and templates/');
  });

  it('keeps only the most recent lessons', () => {
    const memory = new InMemoryMemoryRepository();
    for (let index = 0; index < 45; index += 1) {
      memory.saveLesson({ id: `l${index}`, appId: 'app', text: `Lesson ${index}`, sourceTaskId: null, createdAt: `2026-09-25T10:${String(index).padStart(2, '0')}:00Z` });
    }

    const pack = new ContextPack({ memory, knowledge: bare }).forApp(app);

    expect(pack).not.toContain('- Lesson 4\n');
    expect(pack).toContain('- Lesson 5\n');
    expect(pack).toContain('- Lesson 44');
  });
});
