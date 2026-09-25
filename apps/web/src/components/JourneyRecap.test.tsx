import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { JourneyRecap } from './JourneyRecap';
import { NETWORK, task } from '../test/fixtures';
import { readJourney, saveJourney, snapshot } from '../state/journey';

beforeEach(() => window.localStorage.clear());

describe('returning to a project', () => {
  it('does not invent activity on a first visit', () => {
    render(<JourneyRecap network={NETWORK} taskId={null} onOpen={() => {}} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(readJourney(NETWORK.app.id)?.tasks['m1']).toContain('integrated:done');
  });

  it('compares visits, resumes the right station, and does not count abandonment as completion', () => {
    saveJourney(NETWORK.app.id, snapshot(NETWORK, 'i1'));
    const network = { ...NETWORK, tasks: NETWORK.tasks.map((item) => item.id === 'm2' ? { ...item, status: { kind: 'done' as const } } : item.id === 'i2' ? { ...item, status: { kind: 'closed' as const, reason: 'abandoned' as const, evidence: '' } } : item) };
    const onOpen = vi.fn();
    render(<JourneyRecap network={network} taskId={null} onOpen={onOpen} />);
    expect(screen.getByText('1 réalisée · 1 clôturée sans réalisation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reprendre là où j’en étais/ }));
    expect(onOpen).toHaveBeenCalledWith('ui', 'i1');
    fireEvent.click(screen.getByRole('button', { name: 'J’ai vu' }));
    expect(screen.queryByRole('heading', { name: 'Depuis ta dernière visite' })).not.toBeInTheDocument();
  });


  it('reports a newly waiting decision even when the task remains in progress', () => {
    saveJourney(NETWORK.app.id, snapshot(NETWORK, null));
    const network = { ...NETWORK, tasks: NETWORK.tasks.map((item) => item.id === 'm2' ? { ...item, status: { kind: 'awaiting-decision' as const, decisionId: 'new-choice' } } : item) };
    render(<JourneyRecap network={network} taskId={null} onOpen={() => {}} />);
    expect(screen.getByText(/1 nouvelle intervention/)).toBeInTheDocument();
  });

  it('isolates apps and ignores deleted stations and malformed storage', () => {
    saveJourney('another-app', snapshot(NETWORK, 'i1'));
    window.localStorage.setItem('terminus:journey:app-1', '{broken');
    expect(readJourney('app-1')).toBeNull();
    saveJourney('app-1', { tasks: {}, lastTask: 'deleted' });
    render(<JourneyRecap network={{ ...NETWORK, tasks: [task('new', 'engine', 'New', { kind: 'todo' })] }} taskId={null} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: /Reprendre/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1 nouvelle station/)).toBeInTheDocument();
  });
});
