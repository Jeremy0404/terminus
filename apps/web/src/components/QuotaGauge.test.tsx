import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuotaGauge } from './QuotaGauge';

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

describe('QuotaGauge', () => {
  it('shows each window with its utilization and reads an elapsed window as reset', () => {
    render(
      <QuotaGauge
        quota={{
          limited: false,
          windows: [
            { kind: 'five-hour', utilization: 0.47, resetsAt: future },
            { kind: 'seven-day', utilization: 0.9, resetsAt: past },
          ],
          observedAt: past,
        }}
      />,
    );

    const [fiveHour, sevenDay] = screen.getAllByRole('meter');
    expect(fiveHour).toHaveAttribute('aria-valuenow', '47');
    expect(fiveHour).toHaveTextContent('5 h47 %');
    expect(sevenDay).toHaveAttribute('aria-valuenow', '0');
    expect(sevenDay).toHaveTextContent('réinitialisé');
  });

  it('flags a reached quota and colours a nearly full window', () => {
    render(<QuotaGauge quota={{ limited: true, windows: [{ kind: 'five-hour', utilization: 1, resetsAt: future }], observedAt: past }} />);

    expect(screen.getByText('Quota atteint')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveClass('tone-stop');
  });

  it('stays hidden until a run has reported the quota', () => {
    const { container } = render(<QuotaGauge quota={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
