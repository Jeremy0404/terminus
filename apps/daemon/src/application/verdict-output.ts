import type { Proposal } from '../domain/decision.js';

export const VERDICT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    verdict: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['continue', 'close', 'split', 'lighten'] },
        reason: { type: 'string' },
        closeReason: { type: 'string', enum: ['already-done', 'obsolete', 'duplicate'] },
        evidence: { type: 'string' },
        stations: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, why: { type: 'string' } },
            required: ['title', 'why'],
          },
        },
      },
      required: ['kind', 'reason'],
    },
  },
  required: ['summary', 'verdict'],
} as const;

export interface Verdict {
  readonly reason: string;
  readonly proposal: Proposal | null;
}

export function readVerdict(output: unknown): Verdict | null {
  const verdict = isRecord(output) ? output['verdict'] : undefined;
  if (!isRecord(verdict) || typeof verdict['reason'] !== 'string') return null;
  const reason = verdict['reason'];
  switch (verdict['kind']) {
    case 'close': {
      const closeReason = verdict['closeReason'];
      if (closeReason !== 'already-done' && closeReason !== 'obsolete' && closeReason !== 'duplicate') return null;
      return { reason, proposal: { kind: 'close', reason: closeReason, evidence: typeof verdict['evidence'] === 'string' ? verdict['evidence'] : '' } };
    }
    case 'split': {
      const stations = Array.isArray(verdict['stations'])
        ? verdict['stations'].filter((station): station is { title: string; why: string } => isRecord(station) && typeof station['title'] === 'string' && typeof station['why'] === 'string')
        : [];
      return stations.length >= 2 ? { reason, proposal: { kind: 'split', stations } } : null;
    }
    case 'lighten':
      return { reason, proposal: { kind: 'lighten' } };
    case 'continue':
      return { reason, proposal: null };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
