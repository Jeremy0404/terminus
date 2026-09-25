import type { ProposedMemory } from '../domain/memory.js';

const MAX_PROPOSALS = 5;

export const MEMORY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    lessons: {
      type: 'array',
      items: { type: 'object', properties: { text: { type: 'string' }, why: { type: 'string' } }, required: ['text', 'why'] },
    },
    terms: {
      type: 'array',
      items: { type: 'object', properties: { term: { type: 'string' }, definition: { type: 'string' }, why: { type: 'string' } }, required: ['term', 'definition', 'why'] },
    },
    obsolete: {
      type: 'array',
      items: { type: 'object', properties: { stationId: { type: 'string' }, reason: { type: 'string' } }, required: ['stationId', 'reason'] },
    },
  },
  required: ['summary', 'lessons', 'terms', 'obsolete'],
} as const;

export interface ProposedEntry {
  readonly proposed: ProposedMemory;
  readonly why: string;
}

export function readMemoryOutput(output: unknown, openStations: ReadonlySet<string> = new Set()): ProposedEntry[] {
  if (!isRecord(output)) return [];
  const lessons = records(output['lessons'])
    .filter((entry) => nonEmpty(entry['text']))
    .slice(0, MAX_PROPOSALS)
    .map((entry): ProposedEntry => ({ proposed: { kind: 'lesson', text: String(entry['text']).trim() }, why: text(entry['why']) }));
  const terms = records(output['terms'])
    .filter((entry) => nonEmpty(entry['term']) && nonEmpty(entry['definition']))
    .slice(0, MAX_PROPOSALS)
    .map((entry): ProposedEntry => ({ proposed: { kind: 'term', term: String(entry['term']).trim(), definition: String(entry['definition']).trim() }, why: text(entry['why']) }));
  const obsolete = records(output['obsolete'])
    .filter((entry) => typeof entry['stationId'] === 'string' && openStations.has(entry['stationId']))
    .slice(0, MAX_PROPOSALS)
    .map((entry): ProposedEntry => ({ proposed: { kind: 'obsolete', targetTaskId: String(entry['stationId']) }, why: text(entry['reason']) }));
  return [...lessons, ...terms, ...obsolete];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
