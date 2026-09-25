import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NETWORK } from '../test/fixtures';
import { NetworkMap } from './NetworkMap';

const renderMap = () => {
  const handlers = { onLine: vi.fn(), onStation: vi.fn(), onBackground: vi.fn() };
  const { container } = render(<NetworkMap network={NETWORK} place={{ app: 'app-1', line: null, task: null }} {...handlers} />);
  return { ...handlers, container };
};

describe('NetworkMap', () => {
  it('shows the origin station labelled with the app name', () => {
    renderMap();
    expect(screen.getByText('terminus', { selector: 'title' }).closest('text')).toHaveClass('origin-name');
  });

  it('reads a click on the origin as a click on the background', () => {
    const handlers = renderMap();
    fireEvent.click(screen.getByText('terminus', { selector: 'title' }));
    expect(handlers.onBackground).toHaveBeenCalledOnce();
    expect(handlers.onLine).not.toHaveBeenCalled();
    expect(handlers.onStation).not.toHaveBeenCalled();
  });

  it('opens a line when it is clicked', () => {
    const handlers = renderMap();
    fireEvent.click(screen.getByRole('button', { name: 'Ligne Moteur' }));
    expect(handlers.onLine).toHaveBeenCalledWith('engine');
  });

  it('links the two stations of a cross-line dependency with one capsule', () => {
    const { container } = renderMap();
    expect(container.querySelectorAll('.interchange-link')).toHaveLength(1);
  });

  it('draws both ends of an interchange as interchange stations that keep their tone and click', () => {
    const handlers = renderMap();
    const zoom = screen.getByRole('button', { name: 'Zoom, Besoin de toi' });
    const adapter = screen.getByRole('button', { name: 'Adaptateur CLI, Agent en route' });

    expect(zoom).toHaveClass('interchange', 'tone-stop');
    expect(adapter).toHaveClass('interchange', 'tone-go');
    expect(screen.getByRole('button', { name: 'Spike CLI, Mergée' })).not.toHaveClass('interchange');
    fireEvent.click(zoom);
    expect(handlers.onStation).toHaveBeenCalledWith('ui', 'i2');
  });
});
