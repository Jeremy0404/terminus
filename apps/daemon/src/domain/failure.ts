export type FailureKind = 'check-failed' | 'loop-detected' | 'budget-exceeded' | 'agent-crashed' | 'quota-exhausted' | 'publish-failed' | 'interrupted';

export interface Failure {
  readonly kind: FailureKind;
  readonly signature: string;
  readonly message: string;
  readonly at: string;
}

export interface FailurePolicy {
  readonly maxAutoRetries: number;
  readonly maxCheckCycles: number;
  readonly loopThreshold: number;
}

export const DEFAULT_FAILURE_POLICY: FailurePolicy = { maxAutoRetries: 1, maxCheckCycles: 3, loopThreshold: 3 };

export function isLooping(signatures: readonly string[], threshold: number): boolean {
  if (signatures.length < threshold) return false;
  const recent = signatures.slice(-threshold);
  return recent.every((signature) => signature === recent[0]);
}

export function decideAfterFailure(failuresInPhase: readonly Failure[], policy: FailurePolicy): 'retry' | 'block' {
  const latest = failuresInPhase.at(-1);
  if (!latest || latest.kind === 'quota-exhausted' || latest.kind === 'interrupted') return 'block';
  return failuresInPhase.length <= policy.maxAutoRetries ? 'retry' : 'block';
}
