import { beforeEach, describe, expect, it } from 'vitest';
import type { TaskSummaryDto } from '@terminus/contracts';
import { NETWORK } from '../test/fixtures';
import { readJourney, resumable, saveJourney, snapshot } from './journey';

beforeEach(() => window.localStorage.clear());

const withStatus = (id: string, status: TaskSummaryDto['status']) => ({
  ...NETWORK,
  tasks: NETWORK.tasks.map((item) => (item.id === id ? { ...item, status } : item)),
});

describe('the journey kept between visits', () => {
  it('ignores malformed storage', () => {
    window.localStorage.setItem('terminus:journey:app-1', '{broken');
    expect(readJourney('app-1')).toBeNull();
  });

  it('keeps each app’s journey to itself', () => {
    saveJourney('another-app', snapshot(NETWORK, 'i1'));
    expect(readJourney('app-1')).toBeNull();
    expect(readJourney('another-app')?.lastTask).toBe('i1');
  });
});

describe('the station to resume', () => {
  it('is the last station opened while it waits, is blocked or runs', () => {
    expect(resumable(NETWORK, 'i1')?.title).toBe('Rendu SVG');
    expect(resumable(NETWORK, 'i2')?.title).toBe('Zoom');
    expect(resumable(NETWORK, 'm2')?.title).toBe('Adaptateur CLI');
  });

  it('is none once that station is done or closed, gone, or never opened', () => {
    expect(resumable(withStatus('i1', { kind: 'done' }), 'i1')).toBeNull();
    expect(resumable(withStatus('i1', { kind: 'closed', reason: 'abandoned', evidence: '' }), 'i1')).toBeNull();
    expect(resumable(NETWORK, 'deleted')).toBeNull();
    expect(resumable(NETWORK, null)).toBeNull();
  });
});
