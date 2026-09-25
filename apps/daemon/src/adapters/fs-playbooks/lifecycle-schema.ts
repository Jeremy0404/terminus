import { z } from 'zod';
import { EFFORTS } from '../../domain/agent-choice.js';

const PHASE_ID = /^[a-z][a-z0-9-]*$/;

const PhaseSchema = z.strictObject({
  id: z.string().regex(PHASE_ID),
  gate: z.enum(['plan-approval', 'human-review', 'merge']).optional(),
  skill: z.string().regex(PHASE_ID).optional(),
  model: z.string().min(1).optional(),
  effort: z.enum(EFFORTS).optional(),
  output: z.enum(['decisions', 'review', 'verdict', 'memory']).optional(),
  executor: z.enum(['agent', 'checks', 'sync', 'code-host']).optional(),
  retryFrom: z.string().regex(PHASE_ID).optional(),
  tracks: z.array(z.enum(['standard', 'light'])).min(1).optional(),
  skippable: z.boolean().optional(),
});

export const LifecycleFileSchema = z
  .strictObject({
    id: z.string().regex(PHASE_ID),
    phases: z.array(PhaseSchema).min(1),
  })
  .refine((file) => new Set(file.phases.map((phase) => phase.id)).size === file.phases.length, {
    message: 'Phase ids must be unique',
    path: ['phases'],
  });
