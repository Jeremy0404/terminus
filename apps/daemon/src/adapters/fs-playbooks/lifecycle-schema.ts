import { z } from 'zod';

const PHASE_ID = /^[a-z][a-z0-9-]*$/;

const PhaseSchema = z.strictObject({
  id: z.string().regex(PHASE_ID),
  gate: z.enum(['plan-approval', 'human-review', 'merge']).optional(),
  skill: z.string().regex(PHASE_ID).optional(),
  model: z.string().min(1).optional(),
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
