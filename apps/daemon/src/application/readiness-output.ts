export const READINESS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    ready: { type: 'boolean' },
    missing: {
      type: 'array',
      items: {
        type: 'object',
        properties: { check: { type: 'string' }, detail: { type: 'string' } },
        required: ['check', 'detail'],
      },
    },
  },
  required: ['summary', 'ready', 'missing'],
} as const;

export interface MissingItem {
  readonly check: string;
  readonly detail: string;
}

export interface Readiness {
  readonly ready: boolean;
  readonly missing: readonly MissingItem[];
}

export function readReadiness(output: unknown): Readiness | null {
  if (!isRecord(output) || typeof output['ready'] !== 'boolean' || !Array.isArray(output['missing'])) return null;
  const missing = output['missing'].filter(
    (item): item is MissingItem => isRecord(item) && typeof item['check'] === 'string' && typeof item['detail'] === 'string',
  );
  return { ready: output['ready'], missing };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
