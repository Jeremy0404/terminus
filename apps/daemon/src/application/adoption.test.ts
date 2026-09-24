import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FsPlaybookRegistry } from '../adapters/fs-playbooks/fs-playbook-registry.js';
import { FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import { InMemoryAppRepository, InMemoryEpicRepository, InMemoryTaskRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { Adoption } from './adoption.js';
import { Catalog } from './catalog.js';
import type { IssueTracker, OpenIssue } from './ports/issue-tracker.js';
import type { RepoScan, RepoScanner } from './ports/repo-scanner.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../playbooks', import.meta.url));

const scan = (overrides: Partial<RepoScan> = {}): RepoScan => ({
  repoPath: '/repo', name: 'repo', isGitRepo: true, hasOrigin: true, defaultBranch: 'main', packageManager: 'pnpm',
  ciWorkflows: ['ci.yml'], agentDocs: [], suggestedVerification: [{ name: 'test', command: 'pnpm run test' }],
  todos: [{ file: 'src/a.ts', line: 3, text: '// TODO handle empty' }], ...overrides,
});

class FakeIssues implements IssueTracker {
  readonly closed: { number: number; comment: string }[] = [];
  failing = new Set<number>();
  listError: Error | null = null;
  constructor(private readonly open: OpenIssue[]) {}
  listOpen(): OpenIssue[] {
    if (this.listError) throw this.listError;
    return this.open;
  }
  close(_repoPath: string, issueNumber: number, comment: string): void {
    if (this.failing.has(issueNumber)) throw new Error('permission denied');
    this.closed.push({ number: issueNumber, comment });
  }
}

let apps: InMemoryAppRepository;
let tasks: InMemoryTaskRepository;
let epics: InMemoryEpicRepository;
let issues: FakeIssues;
let scanned: RepoScan;
let adoption: Adoption;

beforeEach(() => {
  apps = new InMemoryAppRepository();
  epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  issues = new FakeIssues([{ number: 12, title: 'Empty states', url: 'u12', labels: ['ui'] }, { number: 13, title: 'Tags', url: 'u13', labels: [] }]);
  scanned = scan();
  const scanner: RepoScanner = { scan: () => scanned };
  const catalog = new Catalog({ apps, epics, tasks, playbooks: new FsPlaybookRegistry(PLAYBOOKS), clock: new FixedClock(), ids: new SequentialIds(), bus: new RecordingBus() });
  adoption = new Adoption(scanner, { run: () => Promise.resolve([]) }, issues, catalog, apps);
});

describe('Adoption', () => {
  it('proposes open issues and code TODOs', () => {
    expect(adoption.proposals('/repo')).toEqual({ issues: issues.listOpen(), todos: scanned.todos, warnings: [] });
  });

  it('warns instead of failing when issues cannot be read or there is no remote', () => {
    issues.listError = new Error('gh: not logged in');
    expect(adoption.proposals('/repo')).toMatchObject({ issues: [], warnings: ['GitHub issues could not be read: gh: not logged in'] });

    scanned = scan({ hasOrigin: false });
    expect(adoption.proposals('/repo').warnings[0]).toMatch(/No origin remote/);
  });

  it('cuts over: creates the app, its lines and stations, then closes the imported issues', () => {
    const result = adoption.cutOver({
      name: 'tiny-prm',
      repoPath: '/repo',
      verification: [{ name: 'test', command: 'pnpm run test' }],
      lines: [{ code: 'U', name: 'UI', tasks: [{ title: 'Empty states', issueNumber: 12 }, { title: 'Handle empty' }] }],
      closeIssues: true,
    });

    expect(result.app).toMatchObject({ name: 'tiny-prm', repoPath: '/repo', verification: [{ name: 'test', command: 'pnpm run test' }] });
    expect(tasks.listByApp(result.app.id).map((task) => task.title)).toEqual(['Empty states', 'Handle empty']);
    expect(result.closedIssues).toEqual([12]);
    expect(issues.closed[0]?.comment).toMatch(/^Now tracked in Terminus as task task-/);
  });

  it('touches no issue when closing is not asked, and reports issues it could not close', () => {
    adoption.cutOver({ name: 'a', repoPath: '/repo', verification: [], lines: [{ code: 'A', name: 'A', tasks: [{ title: 'x', issueNumber: 12 }] }], closeIssues: false });
    expect(issues.closed).toEqual([]);

    issues.failing.add(13);
    const result = adoption.cutOver({ name: 'b', repoPath: '/other', verification: [], lines: [{ code: 'B', name: 'B', tasks: [{ title: 'y', issueNumber: 13 }] }], closeIssues: true });
    expect(result.closeErrors).toEqual(['#13: permission denied']);
  });

  it('refuses to adopt the same repository twice, or with no line', () => {
    adoption.cutOver({ name: 'a', repoPath: '/repo', verification: [], lines: [{ code: 'A', name: 'A', tasks: [] }], closeIssues: false });
    expect(() => adoption.scan('/repo')).toThrow(/already adopted/);
    expect(() => adoption.cutOver({ name: 'b', repoPath: '/new', verification: [], lines: [], closeIssues: false })).toThrow(/at least one line/);
  });
});
