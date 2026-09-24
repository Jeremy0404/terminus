import { describe, expect, it } from 'vitest';
import { isLastPhase, phaseAt, phaseIndexOf, requiresHuman, type PhaseDefinition } from './lifecycle.js';
import { DomainError } from './errors.js';
import { TASK_LIFECYCLE } from './test-fixtures.js';

const ungated: PhaseDefinition = { id: 'execute' };
const planGate: PhaseDefinition = { id: 'plan', gate: 'plan-approval' };
const reviewGate: PhaseDefinition = { id: 'review', gate: 'human-review' };
const mergeGate: PhaseDefinition = { id: 'merge', gate: 'merge' };

describe('requiresHuman', () => {
  it('stops at every phase when going step by step', () => {
    expect([ungated, planGate, reviewGate, mergeGate].map((phase) => requiresHuman(phase, 'step-by-step'))).toEqual([true, true, true, true]);
  });

  it('stops only at gated phases up to the PR', () => {
    expect([ungated, planGate, reviewGate, mergeGate].map((phase) => requiresHuman(phase, 'up-to-pr'))).toEqual([false, true, true, true]);
  });

  it('keeps only the plan approval when allowed up to merge', () => {
    expect([ungated, planGate, reviewGate, mergeGate].map((phase) => requiresHuman(phase, 'up-to-merge'))).toEqual([false, true, false, false]);
  });
});

describe('phase lookup', () => {
  it('finds phases by index and id', () => {
    expect(phaseAt(TASK_LIFECYCLE, 2).id).toBe('plan');
    expect(phaseIndexOf(TASK_LIFECYCLE, 'review')).toBe(5);
    expect(isLastPhase(TASK_LIFECYCLE, 6)).toBe(true);
  });

  it('rejects unknown phases', () => {
    expect(() => phaseAt(TASK_LIFECYCLE, 7)).toThrow(DomainError);
    expect(() => phaseIndexOf(TASK_LIFECYCLE, 'deploy')).toThrow(DomainError);
  });
});
