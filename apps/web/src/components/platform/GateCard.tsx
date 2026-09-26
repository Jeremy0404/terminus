import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChecksStateDto, GateDto, RunDto, TaskSummaryDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from './useAction';

const CHECKS_POLL_MS = 10_000;

type ChecksDisplayState = ChecksStateDto | 'loading' | 'error';

const CHECKS_CLASS: Record<ChecksDisplayState, string> = {
  success: 'good',
  none: 'muted',
  pending: '',
  failure: 'bad',
  loading: 'wait',
  error: 'warn',
};

const CHECKS_MERGEABLE: ReadonlySet<ChecksDisplayState> = new Set<ChecksDisplayState>(['success', 'none']);

interface Props {
  readonly task: TaskSummaryDto;
  readonly gate: GateDto;
  readonly runs: readonly RunDto[];
}

interface ReviewOutput {
  readonly verdict: string;
  readonly summary: string;
  readonly findings: readonly { readonly severity: string; readonly file?: string; readonly summary: string }[];
}

const isReview = (output: unknown): output is ReviewOutput =>
  typeof output === 'object' && output !== null && 'verdict' in output && 'findings' in output && Array.isArray(output.findings);

const pullRequestOf = (runs: readonly RunDto[]): { number: number; url: string } | null => {
  for (const run of [...runs].reverse()) {
    const output = run.output;
    if (typeof output === 'object' && output !== null && 'pullRequest' in output) return output.pullRequest as { number: number; url: string };
  }
  return null;
};

function outputAt(runs: readonly RunDto[], phaseIndex: number): unknown {
  return [...runs].reverse().find((run) => run.phaseIndex === phaseIndex && run.status === 'succeeded')?.output;
}

function briefOf(runs: readonly RunDto[], phaseIndex: number): string | null {
  const output = outputAt(runs, phaseIndex);
  return typeof output === 'object' && output !== null && 'brief' in output && typeof output.brief === 'string' ? output.brief : null;
}

interface StackOutput {
  readonly stackName: string;
  readonly decisions: readonly { readonly title: string; readonly decision: string; readonly why: string }[];
  readonly verification: readonly { readonly name: string; readonly command: string }[];
}

function stackOf(runs: readonly RunDto[], phaseIndex: number): StackOutput | null {
  const output = outputAt(runs, phaseIndex);
  if (typeof output !== 'object' || output === null || !('stackName' in output) || typeof output.stackName !== 'string') return null;
  const record = output as Partial<StackOutput>;
  return { stackName: output.stackName, decisions: record.decisions ?? [], verification: record.verification ?? [] };
}

export function GateCard({ task, gate, runs }: Props) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const earlier = task.phases.slice(0, task.phaseIndex).filter((phase) => task.phasesInTrack.includes(phase));
  const [target, setTarget] = useState(earlier.includes('execute') ? 'execute' : (earlier.at(-1) ?? ''));
  const [comment, setComment] = useState('');
  const [checks, setChecks] = useState<ChecksDisplayState>('loading');
  const review = [...runs].reverse().find((candidate) => isReview(candidate.output))?.output;
  const pullRequest = gate === 'merge' ? pullRequestOf(runs) : null;

  useEffect(() => {
    if (gate !== 'merge') return;
    const poll = () => {
      api.checks(task.id)
        .then((response) => setChecks(response.state))
        .catch(() => setChecks('error'));
    };
    poll();
    const interval = setInterval(poll, CHECKS_POLL_MS);
    return () => clearInterval(interval);
  }, [gate, task.id]);

  if (gate === 'merge') {
    return (
      <div className="action-card">
        <span className="eyebrow">{t('gate.merge.eyebrow')}</span>
        <h3>{t('gate.merge.title')}</h3>
        {pullRequest && <p><a href={pullRequest.url} target="_blank" rel="noreferrer">{t('gate.merge.pullRequest', { number: pullRequest.number })}</a></p>}
        <p><span className={['tag', CHECKS_CLASS[checks]].filter(Boolean).join(' ')}>{t(`gate.merge.checks.${checks}`)}</span></p>
        <div className="row">
          <button type="button" className="btn primary" disabled={busy || !CHECKS_MERGEABLE.has(checks)} onClick={() => void run(() => api.act(task.id, 'merge'))}>{t('gate.merge.action')}</button>
        </div>
        {error && <p className="action-error" role="alert">{error}</p>}
      </div>
    );
  }

  const phaseId = task.phases[task.phaseIndex] ?? '';
  const brief = phaseId === 'brief' ? briefOf(runs, task.phaseIndex) : null;
  const stack = phaseId === 'architecture' ? stackOf(runs, task.phaseIndex) : null;
  const serverSteps = phaseId === 'server';
  const gateKey = phaseId === 'brief' ? 'gate.brief' : phaseId === 'architecture' ? 'gate.stack' : serverSteps ? 'gate.server' : `gate.${gate}`;

  return (
    <div className="action-card">
      <span className="eyebrow">{t(`${gateKey}.eyebrow`)}</span>
      <h3>{t(`${gateKey}.title`)}</h3>
      {brief && <div className="brief-preview">{brief}</div>}
      {stack && (
        <div className="brief-preview">
          <p><b>{stack.stackName}</b></p>
          <ul className="findings">
            {stack.decisions.map((entry) => (
              <li key={entry.title}><b>{entry.title}</b> {entry.decision}{entry.why && <span className="muted"> · {entry.why}</span>}</li>
            ))}
          </ul>
          {stack.verification.length > 0 && <p className="muted small">{t('gate.stack.checks', { commands: stack.verification.map((check) => check.command).join(' · ') })}</p>}
        </div>
      )}
      {gate === 'human-review' && isReview(review) && (
        <div className="review">
          <p><span className={`tag ${review.verdict === 'approve' ? 'good' : ''}`}>{t(`gate.verdict.${review.verdict}`, { defaultValue: review.verdict })}</span> {review.summary}</p>
          {review.findings.length > 0 && (
            <ul className="findings">
              {review.findings.map((finding, index) => (
                <li key={index}><b>{finding.severity}</b> {finding.file && <code>{finding.file}</code>} {finding.summary}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => api.act(task.id, 'approve'))}>{t(serverSteps ? 'gate.server.approve' : 'gate.approve')}</button>
        {earlier.length > 0 && (
          <>
            <select aria-label={t('gate.sendBackTo')} value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy}>
              {earlier.map((phase) => <option key={phase} value={phase}>{t(`phase.${phase}`)}</option>)}
            </select>
            <button type="button" className="btn" disabled={busy || !target} onClick={() => void run(() => api.sendBack(task.id, target, comment))}>{t('gate.sendBack')}</button>
          </>
        )}
      </div>
      {earlier.length > 0 && (
        <textarea
          className="free-answer send-back-comment"
          aria-label={t('gate.sendBackComment')}
          placeholder={t('gate.sendBackComment')}
          value={comment}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => setComment(event.target.value)}
        />
      )}
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}
