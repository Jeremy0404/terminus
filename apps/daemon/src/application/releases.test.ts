import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, SequentialIds } from '../adapters/in-memory/fakes.js';
import { InMemoryAppRepository, InMemoryDeploymentRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { DomainError } from '../domain/errors.js';
import { versionOf, type ReleaseState } from '../domain/release.js';
import type { ChecksState } from './ports/code-host.js';
import { Releases } from './releases.js';

const waiting: ReleaseState = {
  deploysOnRelease: true,
  pending: { number: 87, version: '1.0.0', title: 'chore(main): release 1.0.0', url: 'u', notes: '' },
  latest: { version: '0.2.0', publishedAt: '2026-08-10T16:54:07Z', url: 'u' },
  lastRun: { id: 31, version: '0.2.0', state: 'succeeded', startedAt: 'x', url: 'run-31' },
};

let state: ReleaseState;
let checks: ChecksState;
let merged: number[];
let asked: number;
let notes: string[];
let deployments: InMemoryDeploymentRepository;
let releases: Releases;

beforeEach(() => {
  state = waiting;
  checks = 'success';
  merged = [];
  asked = 0;
  notes = [];
  deployments = new InMemoryDeploymentRepository();
  const apps = new InMemoryAppRepository();
  apps.save({ id: 'app', name: 'tiny-prm', repoPath: '/repo', verification: [], createdAt: 'x' });
  releases = new Releases({
    apps,
    deployments,
    clock: new FixedClock('2026-09-25T10:00:00.000Z'),
    ids: new SequentialIds(),
    notifier: { notify: (message) => notes.push(message) },
    target: { state: () => { asked += 1; return state; } },
    codeHost: { checks: () => checks, merge: (_repo, number) => merged.push(number) },
  });
});

describe('Releases', () => {
  it('asks the deploy target at most every thirty seconds unless asked for a fresh state', () => {
    releases.state('app');
    releases.state('app');
    releases.state('app', true);
    expect(asked).toBe(2);
    expect(() => releases.state('ghost')).toThrow(DomainError);
  });

  it('ships the release the human saw, once its CI is green, and follows its run to production', () => {
    const deployment = releases.deploy('app', '1.0.0');

    expect(merged).toEqual([87]);
    expect(deployment).toMatchObject({ version: '1.0.0', pullRequest: 87, state: 'requested', requestedAt: '2026-09-25T10:00:00.000Z' });
    expect(notes).toEqual(['🚀 tiny-prm v1.0.0 : déploiement lancé depuis Terminus']);

    state = { ...waiting, pending: null, lastRun: { id: 32, version: '1.0.0', state: 'running', startedAt: 'y', url: 'run-32' } };
    expect(releases.state('app', true)?.deployments[0]).toMatchObject({ state: 'running', runUrl: 'run-32' });

    state = { ...state, lastRun: { id: 32, version: '1.0.0', state: 'succeeded', startedAt: 'y', url: 'run-32' } };
    expect(releases.state('app', true)?.deployments[0]).toMatchObject({ state: 'succeeded', finishedAt: '2026-09-25T10:00:00.000Z' });
    expect(notes.at(-1)).toBe('✅ tiny-prm v1.0.0 est en production');
    releases.state('app', true);
    expect(notes).toHaveLength(2);
  });

  it('refuses a release that changed since it was shown, or whose CI is not green', () => {
    expect(() => releases.deploy('app', '0.9.0')).toThrow(/now v1\.0\.0, not v0\.9\.0/);
    checks = 'failure';
    expect(() => releases.deploy('app', '1.0.0')).toThrow(/CI on the release pull request #87 is failure/);
    state = { ...waiting, pending: null };
    expect(() => releases.deploy('app', '1.0.0')).toThrow(/no release waiting/);
    expect(merged).toEqual([]);
  });

  it('reads versions from release titles and tags', () => {
    expect(versionOf('chore(main): release 1.0.0')).toBe('1.0.0');
    expect(versionOf('v0.2.0')).toBe('0.2.0');
    expect(versionOf('main')).toBeNull();
  });
});
