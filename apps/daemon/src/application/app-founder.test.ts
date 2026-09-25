import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FsPlaybookRegistry } from '../adapters/fs-playbooks/fs-playbook-registry.js';
import { FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import { InMemoryAppRepository, InMemoryEpicRepository, InMemoryTaskRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { DomainError } from '../domain/errors.js';
import { AppFounder, slugOf } from './app-founder.js';
import { Catalog } from './catalog.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../playbooks', import.meta.url));

let created: { path: string; name: string; visibility: string }[];
let founder: AppFounder;
let epics: InMemoryEpicRepository;
let tasks: InMemoryTaskRepository;

beforeEach(() => {
  created = [];
  const apps = new InMemoryAppRepository();
  epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  const catalog = new Catalog({ apps, epics, tasks, playbooks: new FsPlaybookRegistry(PLAYBOOKS), clock: new FixedClock(), ids: new SequentialIds(), bus: new RecordingBus() });
  founder = new AppFounder({ catalog, repositories: { create: (path, name, visibility) => created.push({ path, name, visibility }) }, projectsDir: '/home/me/dev/projects/' });
});

describe('AppFounder', () => {
  it('creates the repository, the app and its foundation line starting with framing the idea', () => {
    const app = founder.found({ name: 'Carnet de Vélo', idea: 'Log my rides and see progress.', visibility: 'private' });

    expect(created).toEqual([{ path: '/home/me/dev/projects/carnet-de-velo', name: 'carnet-de-velo', visibility: 'private' }]);
    expect(app).toMatchObject({ name: 'Carnet de Vélo', repoPath: '/home/me/dev/projects/carnet-de-velo', verification: [] });
    const [line] = epics.listByApp(app.id);
    expect(line).toMatchObject({ code: 'F', name: 'Fondations', description: 'Log my rides and see progress.' });
    const [framing, stack, scaffold] = tasks.listByEpic(line?.id ?? '');
    expect(framing).toMatchObject({ title: 'Cadrer l’idée', description: 'Log my rides and see progress.' });
    expect(framing?.lifecycle.id).toBe('app-framing');
    expect(framing?.lifecycle.phases.map((phase) => phase.id)).toEqual(['grill', 'brief']);
    expect(stack).toMatchObject({ title: 'Choisir la stack et l’architecture', dependsOn: [framing?.id] });
    expect(stack?.lifecycle.phases.map((phase) => phase.id)).toEqual(['options', 'architecture']);
    expect(scaffold).toMatchObject({ title: 'Poser le socle', dependsOn: [stack?.id] });
    expect(scaffold?.lifecycle.phases.map((phase) => phase.id)).toEqual(['execute', 'verify', 'review', 'sync', 'merge', 'retro']);
  });

  it('uses the folder given, and refuses a name with nothing usable', () => {
    founder.found({ name: 'Quiz', idea: 'x', repoPath: '/tmp/quiz-app', visibility: 'public' });
    expect(created[0]).toEqual({ path: '/tmp/quiz-app', name: 'quiz', visibility: 'public' });
    expect(() => founder.found({ name: '!!!', idea: 'x', visibility: 'private' })).toThrow(DomainError);
  });

  it('turns a name into a repository slug', () => {
    expect(slugOf('  L’Atelier du Pain  ')).toBe('l-atelier-du-pain');
  });
});
