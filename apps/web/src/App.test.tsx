import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('shows the daemon version once the health check answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok', version: '0.1.0' })));

    render(<App />);

    expect(await screen.findByText('Démon connecté · version 0.1.0')).toBeInTheDocument();
  });

  it('says the daemon is unreachable when the health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText('Démon injoignable')).toBeInTheDocument();
  });
});
