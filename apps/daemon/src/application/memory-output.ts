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
  },
  required: ['summary', 'lessons', 'terms'],
} as const;

export interface ProposedEntry {
  readonly proposed: ProposedMemory;
  readonly why: string;
}

export function readMemoryOutput(output: unknown): ProposedEntry[] {
  if (!isRecord(output)) return [];
  const lessons = records(output['lessons'])
    .filter((entry) => nonEmpty(entry['text']))
    .slice(0, MAX_PROPOSALS)
    .map((entry): ProposedEntry => ({ proposed: { kind: 'lesson', text: String(entry['text']).trim() }, why: text(entry['why']) }));
  const terms = records(output['terms'])
    .filter((entry) => nonEmpty(entry['term']) && nonEmpty(entry['definition']))
    .slice(0, MAX_PROPOSALS)
    .map((entry): ProposedEntry => ({ proposed: { kind: 'term', term: String(entry['term']).trim(), definition: String(entry['definition']).trim() }, why: text(entry['why']) }));
  return [...lessons, ...terms];
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
