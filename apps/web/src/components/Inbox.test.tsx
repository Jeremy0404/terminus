import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Inbox } from './Inbox';
import { NETWORK, task } from '../test/fixtures';

describe('departures board', () => {
  it('keeps requests from other lines visible and navigates straight to them', () => {
    const onOpen = vi.fn();
    render(<Inbox network={NETWORK} lineId="engine" onOpen={onOpen} />);
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    expect(inbox).toHaveClass('needs-attention');
    expect(within(inbox).getByRole('heading', { name: 'Sur les autres lignes · 2' })).toBeInTheDocument();
    fireEvent.click(within(inbox).getByRole('button', { name: /Rendu SVG/ }));
    expect(onOpen).toHaveBeenCalledWith('ui', 'i1');
  });

  it('stays calm for available work and never offers a task whose dependencies are missing', () => {
    render(<Inbox network={{ ...NETWORK, inbox: [], tasks: [
      task('ready', 'engine', 'Prête', { kind: 'todo' }),
      task('waiting', 'engine', 'Attendre', { kind: 'todo' }, { dependsOn: ['missing'] }),
    ] }} lineId={null} onOpen={() => {}} />);
    expect(screen.getByRole('region', { name: 'À toi de jouer' })).toHaveClass('is-calm');
    expect(screen.getByRole('button', { name: /Prête/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Attendre/ })).not.toBeInTheDocument();
  });

  it('ranks decisions by downstream impact and includes manual interventions', () => {
    const network = { ...NETWORK, tasks: [
      task('low', 'engine', 'Faible', { kind: 'awaiting-decision', decisionId: 'd1' }),
      task('high', 'engine', 'Forte', { kind: 'awaiting-gate', gate: 'plan-approval' }),
      task('manual', 'engine', 'Manuelle', { kind: 'manual' }),
      task('next', 'ui', 'Suite', { kind: 'todo' }, { dependsOn: ['high'] }),
    ], inbox: [] };
    render(<Inbox network={network} lineId={null} onOpen={() => {}} />);
    const items = within(screen.getByRole('region', { name: 'À toi de jouer' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Forte');
    expect(items[1]).toHaveTextContent('Faible');
    expect(items[2]).toHaveTextContent('Manuelle');
  });
});
