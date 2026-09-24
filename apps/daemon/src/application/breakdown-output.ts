import type { BreakdownProposal, ProposedStation } from '../domain/epic.js';

export const BREAKDOWN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    stations: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          why: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'integer', minimum: 0 } },
        },
        required: ['title', 'why', 'dependsOn'],
      },
    },
  },
  required: ['description', 'stations'],
} as const;

export function readBreakdown(output: unknown): BreakdownProposal | null {
  if (!isRecord(output) || typeof output['description'] !== 'string' || !Array.isArray(output['stations'])) return null;
  const stations: ProposedStation[] = [];
  for (const candidate of output['stations']) {
    if (!isRecord(candidate) || typeof candidate['title'] !== 'string' || !candidate['title'].trim()) continue;
    const index = stations.length;
    const dependsOn = Array.isArray(candidate['dependsOn'])
      ? candidate['dependsOn'].filter((dependency): dependency is number => Number.isInteger(dependency) && dependency >= 0 && dependency < index)
      : [];
    stations.push({ title: candidate['title'].trim(), why: typeof candidate['why'] === 'string' ? candidate['why'] : '', dependsOn });
  }
  return stations.length > 0 ? { description: output['description'], stations } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
