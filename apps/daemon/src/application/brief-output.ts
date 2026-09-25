export const BRIEF_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    brief: { type: 'string' },
  },
  required: ['summary', 'brief'],
} as const;

export function readBrief(output: unknown): string | null {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) return null;
  const brief = (output as Record<string, unknown>)['brief'];
  return typeof brief === 'string' && brief.trim() ? brief.trim() : null;
}
