import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GateCard } from './GateCard';
import { task } from '../../test/fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('GateCard', () => {
  it('asks to confirm the server steps at the server phase', async () => {
    const posted: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      posted.push(`${init?.method ?? 'GET'} ${String(input)} ${String(init?.body ?? '')}`);
      return Response.json({});
    }));
    const phases = ['merge', 'server', 'server-check', 'retro'];
    const server = task('p1', 'engine', 'Mettre en production', { kind: 'awaiting-gate', gate: 'plan-approval' }, { lifecycleId: 'app-deploy', phases, phasesInTrack: phases, phaseIndex: 1 });
    render(<GateCard task={server} gate="plan-approval" runs={[]} />);

    expect(screen.getByRole('heading', { name: 'Les étapes serveur sont-elles faites ?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'J’ai fait les étapes serveur' }));
    await waitFor(() => expect(posted.some((call) => call.startsWith('POST') && call.includes('approve'))).toBe(true));
  });
});
