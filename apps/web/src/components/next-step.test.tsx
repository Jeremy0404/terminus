import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NetworkDto } from '@terminus/contracts';
import { NETWORK, task } from '../test/fixtures';
import { LineCard } from './LineCard';
import { NetworkSummary } from './NetworkSummary';

const calm: NetworkDto = {
  ...NETWORK,
  tasks: [task('m1', 'engine', 'Spike CLI', { kind: 'done' }), task('m3', 'engine', 'Boucle de retry', { kind: 'todo' }, { dependsOn: ['m1'] })],
  inbox: [],
};

describe('next step', () => {
  it('points the network to the next station to open', () => {
    const onStation = vi.fn();
    render(<NetworkSummary network={calm} onStation={onStation} onLine={() => {}} onMemory={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir « Boucle de retry »' }));

    expect(onStation).toHaveBeenCalledWith('engine', 'm3');
  });

  it('stays quiet while the inbox asks for something', () => {
    render(<NetworkSummary network={NETWORK} onStation={() => {}} onLine={() => {}} onMemory={() => {}} />);
    expect(screen.queryByText('Prochain arrêt')).toBeNull();
  });

  it('sends the network to an empty line, where breaking it down is the main action', () => {
    const onLine = vi.fn();
    const empty: NetworkDto = { ...calm, tasks: [calm.tasks[0]!] };
    render(<NetworkSummary network={empty} onStation={() => {}} onLine={onLine} onMemory={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Découper « Interface »' }));
    expect(onLine).toHaveBeenCalledWith('ui');

    render(<LineCard network={empty} lineId="ui" onStation={() => {}} />);
    expect(screen.getByRole('button', { name: 'Découper avec l’agent' })).toHaveClass('primary');
  });

  it('asks to review memory proposals before anything else on the network', () => {
    const onMemory = vi.fn();
    render(<NetworkSummary network={{ ...calm, memoryProposals: 2 }} onStation={() => {}} onLine={() => {}} onMemory={onMemory} />);

    fireEvent.click(screen.getByRole('button', { name: 'Relire 2 propositions de mémoire' }));

    expect(onMemory).toHaveBeenCalled();
  });
});
