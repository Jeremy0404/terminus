import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RunLog } from './RunLog';

describe('RunLog', () => {
  it('renders a distinct line for a check-started event vs. the ✓/✗ result line', () => {
    render(<RunLog events={[{ type: 'check-started', name: 'test', command: 'pnpm test' }]} />);

    expect(screen.getByText(/test/)).toBeInTheDocument();
    expect(screen.getByText(/test/).textContent).not.toMatch(/^[✓✗]/);
  });

  it('folds a started event followed by output into a single line showing the latest output', () => {
    render(
      <RunLog
        events={[
          { type: 'check-started', name: 'test', command: 'pnpm test' },
          { type: 'check-output', name: 'test', command: 'pnpm test', outputTail: '…partial…' },
        ]}
      />,
    );

    const lines = screen.getAllByText(/test/);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toContain('…partial…');
  });

  it('replaces the in-progress line with the final ✓/✗ result, not appending below it', () => {
    render(
      <RunLog
        events={[
          { type: 'check-started', name: 'test', command: 'pnpm test' },
          { type: 'check-output', name: 'test', command: 'pnpm test', outputTail: '…partial…' },
          { name: 'test', command: 'pnpm test', ok: true, exitCode: 0, outputTail: 'all good', durationMs: 5 },
        ]}
      />,
    );

    const lines = screen.getAllByText(/test/);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toMatch(/^✓/);
  });

  it('shows a finished command then a separate in-progress line for the next one, in order', () => {
    render(
      <RunLog
        events={[
          { name: 'test', command: 'pnpm test', ok: true, exitCode: 0, outputTail: '', durationMs: 5 },
          { type: 'check-started', name: 'build', command: 'pnpm build' },
          { type: 'check-output', name: 'build', command: 'pnpm build', outputTail: 'compiling…' },
        ]}
      />,
    );

    const pre = document.querySelector('.run-log');
    const text = pre?.textContent ?? '';
    expect(text.indexOf('✓ test')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('build')).toBeGreaterThan(text.indexOf('✓ test'));
    expect(screen.getAllByText(/build/)).toHaveLength(1);
  });

  it('shows the empty-log message only when no events have happened yet', () => {
    const { rerender } = render(<RunLog events={[]} />);
    expect(screen.getByText('En attente des premiers événements…')).toBeInTheDocument();

    rerender(<RunLog events={[{ type: 'check-started', name: 'test', command: 'pnpm test' }]} />);
    expect(screen.queryByText('En attente des premiers événements…')).not.toBeInTheDocument();
  });

  it('follows new lines until the reader scrolls up, and offers to follow again', () => {
    const text = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'text', text: `line ${i}` }));
    const { rerender } = render(<RunLog events={text(1)} live />);
    const pre = document.querySelector('.run-log') as HTMLPreElement;
    Object.defineProperty(pre, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(pre, 'clientHeight', { configurable: true, value: 200 });

    rerender(<RunLog events={text(2)} live />);
    expect(pre.scrollTop).toBe(1000);

    pre.scrollTop = 100;
    fireEvent.scroll(pre);
    rerender(<RunLog events={text(3)} live />);
    expect(pre.scrollTop).toBe(100);

    fireEvent.click(screen.getByRole('button', { name: '↓ Suivre' }));
    expect(pre.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: '↓ Suivre' })).toBeNull();
  });
});
