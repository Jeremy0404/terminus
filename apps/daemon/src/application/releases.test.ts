import { describe, expect, it } from 'vitest';
import { FixedClock } from '../adapters/in-memory/fakes.js';
import { InMemoryAppRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { DomainError } from '../domain/errors.js';
import { versionOf, type ReleaseState } from '../domain/release.js';
import { Releases } from './releases.js';

const state: ReleaseState = { deploysOnRelease: true, pending: null, latest: null, lastRun: null };

describe('Releases', () => {
  it('asks the deploy target at most every thirty seconds unless asked for a fresh state', () => {
    const apps = new InMemoryAppRepository();
    apps.save({ id: 'app', name: 'tiny-prm', repoPath: '/repo', verification: [], createdAt: 'x' });
    const asked: string[] = [];
    const releases = new Releases({ apps, clock: new FixedClock(), target: { state: (repoPath) => { asked.push(repoPath); return state; } } });

    expect(releases.state('app')).toBe(state);
    releases.state('app');
    releases.state('app', true);

    expect(asked).toEqual(['/repo', '/repo']);
    expect(() => releases.state('ghost')).toThrow(DomainError);
  });

  it('reads versions from release titles and tags', () => {
    expect(versionOf('chore(main): release 1.0.0')).toBe('1.0.0');
    expect(versionOf('v0.2.0')).toBe('0.2.0');
    expect(versionOf('main')).toBeNull();
  });
});
