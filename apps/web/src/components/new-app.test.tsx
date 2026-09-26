import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TaskDetailDto } from '@terminus/contracts';
import { detailOf, task } from '../test/fixtures';
import { ActionPanel } from './platform/ActionPanel';

describe('starting an app from an idea', () => {
  it('shows the product brief at its approval gate', () => {
    const framing = { ...task('f1', 'engine', 'Cadrer', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 1 }), phases: ['grill', 'brief'], phasesInTrack: ['grill', 'brief'] };
    const detail: TaskDetailDto = {
      ...detailOf(framing),
      runs: [{ id: 'r', phaseIndex: 1, status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, agent: null, output: { summary: 'ok', brief: '## Problème\n\nTrop d’onglets.' } }],
    };
    render(<ActionPanel detail={detail} live={[]} />);

    expect(screen.getByText('Brief à valider')).toBeInTheDocument();
    expect(screen.getByText(/Trop d’onglets\./)).toBeInTheDocument();
  });

  it('shows the chosen stack and its decisions at its approval gate', () => {
    const stack = { ...task('s1', 'engine', 'Stack', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 1 }), phases: ['options', 'architecture'], phasesInTrack: ['options', 'architecture'] };
    const detail: TaskDetailDto = {
      ...detailOf(stack),
      runs: [{
        id: 'r', phaseIndex: 1, status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, agent: null,
        output: { summary: 'ok', stackId: 'stack-static-site', stackName: 'Site statique', decisions: [{ title: 'Hébergement', decision: 'nginx', why: 'Simple' }], verification: [{ name: 'html', command: 'npx html-validate' }] },
      }],
    };
    render(<ActionPanel detail={detail} live={[]} />);

    expect(screen.getByText('Stack à valider')).toBeInTheDocument();
    expect(screen.getByText('Site statique')).toBeInTheDocument();
    expect(screen.getByText('Hébergement')).toBeInTheDocument();
    expect(screen.getByText('Vérifications de l’app : npx html-validate')).toBeInTheDocument();
  });
});
