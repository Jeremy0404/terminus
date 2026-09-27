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

  it('lists the stations an agent is on under their own group, between the blockages and the stations ready to start', () => {
    const onOpen = vi.fn();
    const network = { ...NETWORK, inbox: [], tasks: [
      task('start', 'engine', 'Démarrable', { kind: 'todo' }),
      task('running', 'engine', 'En route', { kind: 'running', runId: 'run-1' }),
      task('queued', 'ui', 'À quai', { kind: 'ready', mode: 'fresh' }),
      task('stuck', 'ui', 'Coincée', { kind: 'manual' }),
      task('choice', 'ui', 'Choix', { kind: 'awaiting-decision', decisionId: 'd1' }),
    ] };
    render(<Inbox network={network} lineId={null} onOpen={onOpen} />);
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    expect(within(inbox).getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Décisions attendues 1',
      'À débloquer 1',
      'Stations en cours 2',
      'Prêts à démarrer 1',
    ]);
    const underway = within(inbox).getByRole('heading', { name: 'Stations en cours 2' }).parentElement!;
    expect(within(underway).getAllByRole('listitem').map((item) => item.querySelector('.inbox-task')?.textContent)).toEqual(['À quai', 'En route']);
    fireEvent.click(within(underway).getByRole('button', { name: /En route/ }));
    expect(onOpen).toHaveBeenCalledWith('engine', 'running');
  });

  it('stays calm when the only open work is in an agent’s hands', () => {
    render(<Inbox network={{ ...NETWORK, inbox: [], tasks: [task('running', 'engine', 'En route', { kind: 'running', runId: 'run-1' })] }} lineId={null} onOpen={() => {}} />);
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    expect(inbox).toHaveClass('is-calm');
    expect(within(inbox).getByLabelText('0 intervention attendue sur le réseau')).toHaveTextContent('0');
    expect(within(inbox).getByRole('button', { name: /En route/ })).toBeInTheDocument();
  });

  it('leaves the stations in an agent’s hands out of a line’s list, here and on the other lines', () => {
    const network = { ...NETWORK, inbox: [], tasks: [
      task('running', 'engine', 'En route', { kind: 'running', runId: 'run-1' }),
      task('queued', 'ui', 'À quai', { kind: 'ready', mode: 'fresh' }),
      task('choice', 'ui', 'Choix', { kind: 'awaiting-decision', decisionId: 'd1' }),
    ] };
    render(<Inbox network={network} lineId="engine" onOpen={() => {}} />);
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    expect(within(inbox).getByText('Rien ne t’attend ici.')).toBeInTheDocument();
    expect(within(inbox).getByRole('heading', { name: 'Sur les autres lignes · 1' })).toBeInTheDocument();
    expect(within(inbox).queryByRole('button', { name: /En route/ })).not.toBeInTheDocument();
    expect(within(inbox).queryByRole('button', { name: /À quai/ })).not.toBeInTheDocument();
  });

  it('puts the station to resume first, even when it also waits below', () => {
    const onOpen = vi.fn();
    const resume = NETWORK.tasks.find((item) => item.id === 'i1')!;
    render(<Inbox network={NETWORK} lineId={null} resume={resume} onOpen={onOpen} />);
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    const entry = within(inbox).getByRole('button', { name: 'Reprendre là où j’en étais : Rendu SVG' });
    expect(entry.compareDocumentPosition(within(inbox).getAllByRole('heading')[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(inbox).getAllByRole('listitem')[0]).toHaveTextContent('Rendu SVG');
    fireEvent.click(entry);
    expect(onOpen).toHaveBeenCalledWith('ui', 'i1');
  });

  it('offers no station to resume without one', () => {
    render(<Inbox network={NETWORK} lineId={null} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: /Reprendre/ })).not.toBeInTheDocument();
  });
});
