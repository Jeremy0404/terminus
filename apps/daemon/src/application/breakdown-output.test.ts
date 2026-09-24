import { describe, expect, it } from 'vitest';
import { readBreakdown } from './breakdown-output.js';

describe('readBreakdown', () => {
  it('reads the description and ordered stations', () => {
    expect(
      readBreakdown({
        description: 'Adopt repositories',
        stations: [
          { title: 'Scan the repository', why: 'know the stack', dependsOn: [] },
          { title: 'Run the health checks', why: 'baseline', dependsOn: [0] },
        ],
      }),
    ).toEqual({
      description: 'Adopt repositories',
      stations: [
        { title: 'Scan the repository', why: 'know the stack', dependsOn: [] },
        { title: 'Run the health checks', why: 'baseline', dependsOn: [0] },
      ],
    });
  });

  it('drops forward or invalid dependencies and blank stations', () => {
    const proposal = readBreakdown({
      description: 'd',
      stations: [
        { title: 'First', why: 'a', dependsOn: [1, -1, 0.5] },
        { title: '   ', why: 'b', dependsOn: [] },
        { title: 'Second', why: 'c', dependsOn: [0, 7] },
      ],
    });
    expect(proposal?.stations).toEqual([
      { title: 'First', why: 'a', dependsOn: [] },
      { title: 'Second', why: 'c', dependsOn: [0] },
    ]);
  });

  it('rejects output without a description or any station', () => {
    expect(readBreakdown({ stations: [{ title: 'x', why: 'y', dependsOn: [] }] })).toBeNull();
    expect(readBreakdown({ description: 'd', stations: [] })).toBeNull();
  });
});
