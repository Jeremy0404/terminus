import { describe, expect, it } from 'vitest';
import { readVerdict } from './verdict-output.js';

describe('readVerdict', () => {
  it('reads each kind of verdict', () => {
    expect(readVerdict({ summary: 's', verdict: { kind: 'continue', reason: 'fine' } })).toEqual({ reason: 'fine', proposal: null });
    expect(readVerdict({ summary: 's', verdict: { kind: 'close', reason: 'done in #26', closeReason: 'already-done', evidence: 'PR #26' } })).toEqual({
      reason: 'done in #26',
      proposal: { kind: 'close', reason: 'already-done', evidence: 'PR #26' },
    });
    expect(readVerdict({ summary: 's', verdict: { kind: 'lighten', reason: 'one-line fix' } })).toEqual({ reason: 'one-line fix', proposal: { kind: 'lighten' } });
    expect(
      readVerdict({ summary: 's', verdict: { kind: 'split', reason: 'two things', stations: [{ title: 'A', why: 'a' }, { title: 'B', why: 'b' }] } })?.proposal,
    ).toEqual({ kind: 'split', stations: [{ title: 'A', why: 'a' }, { title: 'B', why: 'b' }] });
  });

  it('ignores malformed verdicts rather than acting on them', () => {
    expect(readVerdict(null)).toBeNull();
    expect(readVerdict({ verdict: { kind: 'close', reason: 'x', closeReason: 'abandoned' } })).toBeNull();
    expect(readVerdict({ verdict: { kind: 'split', reason: 'x', stations: [{ title: 'only one', why: 'y' }] } })).toBeNull();
    expect(readVerdict({ verdict: { kind: 'explode', reason: 'x' } })).toBeNull();
  });
});
