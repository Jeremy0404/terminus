import type { AppStack, VerificationCommand } from '../domain/app.js';

export const STACK_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    stackId: { type: 'string' },
    stackName: { type: 'string' },
    decisions: {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' }, decision: { type: 'string' }, why: { type: 'string' } }, required: ['title', 'decision', 'why'] },
    },
    verification: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, command: { type: 'string' } }, required: ['name', 'command'] },
    },
    records: {
      type: 'array',
      items: {
        type: 'object',
        properties: { slug: { type: 'string' }, title: { type: 'string' }, context: { type: 'string' }, decision: { type: 'string' }, consequences: { type: 'string' } },
        required: ['slug', 'title', 'context', 'decision', 'consequences'],
      },
    },
  },
  required: ['summary', 'stackId', 'stackName', 'decisions', 'verification', 'records'],
} as const;

export interface DecisionRecord {
  readonly slug: string;
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly consequences: string;
}

export interface ChosenStack {
  readonly stack: AppStack;
  readonly verification: readonly VerificationCommand[];
  readonly records: readonly DecisionRecord[];
}

export function readStack(output: unknown): ChosenStack | null {
  if (!isRecord(output) || !text(output['stackId']) || !text(output['stackName'])) return null;
  const decisions = records(output['decisions'])
    .filter((entry) => text(entry['title']) && text(entry['decision']))
    .map((entry) => ({ title: text(entry['title']), decision: text(entry['decision']), why: text(entry['why']) }));
  const verification = records(output['verification'])
    .filter((entry) => text(entry['name']) && text(entry['command']))
    .map((entry) => ({ name: text(entry['name']), command: text(entry['command']) }));
  return { stack: { id: text(output['stackId']), name: text(output['stackName']), decisions }, verification, records: decisionRecords(output['records']) };
}

function decisionRecords(value: unknown): DecisionRecord[] {
  return records(value)
    .filter((entry) => text(entry['title']) && text(entry['decision']))
    .map((entry) => ({ slug: text(entry['slug']), title: text(entry['title']), context: text(entry['context']), decision: text(entry['decision']), consequences: text(entry['consequences']) }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
