import { describe, expect, it } from 'vitest';
import { decideAfterFailure, DEFAULT_FAILURE_POLICY, isLooping } from './failure.js';
import { failure } from './test-fixtures.js';

describe('isLooping', () => {
  it('detects the same signature repeated up to the threshold', () => {
    expect(isLooping(['a', 'b', 'b', 'b'], 3)).toBe(true);
  });

  it('ignores progress or too few observations', () => {
    expect(isLooping(['b', 'b', 'c'], 3)).toBe(false);
    expect(isLooping(['b', 'b'], 3)).toBe(false);
  });
});

describe('decideAfterFailure', () => {
  it('retries once automatically, then blocks', () => {
    expect(decideAfterFailure([failure()], DEFAULT_FAILURE_POLICY)).toBe('retry');
    expect(decideAfterFailure([failure(), failure()], DEFAULT_FAILURE_POLICY)).toBe('block');
  });

  it('retries a detected loop once with its diagnosis', () => {
    expect(decideAfterFailure([failure('loop-detected')], DEFAULT_FAILURE_POLICY)).toBe('retry');
  });

  it('never retries an exhausted quota, a human interruption or an isolation breach', () => {
    expect(decideAfterFailure([failure('quota-exhausted')], DEFAULT_FAILURE_POLICY)).toBe('block');
    expect(decideAfterFailure([failure('interrupted')], DEFAULT_FAILURE_POLICY)).toBe('block');
    expect(decideAfterFailure([failure('isolation-breach')], DEFAULT_FAILURE_POLICY)).toBe('block');
  });
});
