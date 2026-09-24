import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Toasts } from '../ActivityFeedback';
import { useAction } from './useAction';

function Probe({ action }: { action: () => Promise<unknown> }) {
  const { busy, run } = useAction();
  return (
    <button type="button" className="btn" disabled={busy} onClick={() => void run(action)}>
      Approuver le plan
    </button>
  );
}

describe('useAction', () => {
  it('marks the clicked button busy until the action ends, then confirms it', async () => {
    let finish: () => void = () => {};
    render(
      <>
        <Probe action={() => new Promise<void>((resolve) => (finish = resolve))} />
        <Toasts />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Approuver le plan' });

    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('✓ Approuver le plan')).toBeNull();

    await act(async () => finish());

    expect(button).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('✓ Approuver le plan')).toBeInTheDocument();
  });
});
