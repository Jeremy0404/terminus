import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckResultDto, CutOverResultDto, ProposalsDto, RepoScanDto, VerificationCommandDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from '../platform/useAction';

const STATIONS = ['scan', 'health', 'import', 'profile', 'cutover'] as const;
type Station = (typeof STATIONS)[number];

interface Props {
  readonly onCancel: () => void;
  readonly onAdopted: (appId: string) => void;
}

export function AdoptionWizard({ onCancel, onAdopted }: Props) {
  const { t } = useTranslation();
  const [station, setStation] = useState<Station>('scan');
  const [repoPath, setRepoPath] = useState('');
  const [scan, setScan] = useState<RepoScanDto | null>(null);
  const [commands, setCommands] = useState<VerificationCommandDto[]>([]);
  const [health, setHealth] = useState<CheckResultDto[] | null>(null);
  const [proposals, setProposals] = useState<ProposalsDto | null>(null);
  const [pickedIssues, setPickedIssues] = useState<number[]>([]);
  const [pickedTodos, setPickedTodos] = useState<number[]>([]);
  const [line, setLine] = useState({ code: 'B', name: t('adopt.import.defaultLine') });
  const [name, setName] = useState('');
  const [closeIssues, setCloseIssues] = useState(true);
  const [result, setResult] = useState<CutOverResultDto | null>(null);
  const { busy, error, run } = useAction();
  const index = STATIONS.indexOf(station);

  const runScan = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      const scanned = await api.scanRepo(repoPath.trim());
      setScan(scanned);
      setCommands([...scanned.suggestedVerification]);
      setName(scanned.name);
    });
  };
  const runHealth = (): Promise<void> => run(async () => setHealth(await api.healthCheck(repoPath.trim(), commands)));
  const loadProposals = (): Promise<void> =>
    run(async () => {
      const loaded = await api.proposals(repoPath.trim());
      setProposals(loaded);
      setPickedIssues(loaded.issues.map((issue) => issue.number));
    });
  const tasks = [
    ...(proposals?.issues ?? []).filter((issue) => pickedIssues.includes(issue.number)).map((issue) => ({ title: issue.title, issueNumber: issue.number })),
    ...(proposals?.todos ?? []).filter((_, todoIndex) => pickedTodos.includes(todoIndex)).map((todo) => ({ title: todo.text.replace(/^.*?\b(TODO|FIXME)\b:?\s*/, '') || `${todo.file}:${todo.line}` })),
  ];
  const cutOver = (): Promise<void> =>
    run(async () => {
      setResult(await api.cutOver({ name: name.trim(), repoPath: repoPath.trim(), verification: commands, lines: [{ ...line, tasks }], closeIssues: closeIssues && pickedIssues.length > 0 }));
    });
  const next = (): void => {
    const following = STATIONS[index + 1];
    if (!following) return;
    setStation(following);
    if (following === 'health' && !health) void runHealth();
    if (following === 'import' && !proposals) void loadProposals();
  };

  return (
    <section className="card adoption" aria-label={t('adopt.title')}>
      <div className="platform-head">
        <div>
          <span className="eyebrow">{t('adopt.eyebrow')}</span>
          <h2>{t('adopt.title')}</h2>
        </div>
        <button type="button" className="btn small" onClick={onCancel}>{t('create.cancel')}</button>
      </div>
      <ol className="phase-strip adoption-line" style={{ gridTemplateColumns: `repeat(${STATIONS.length}, 1fr)`, ['--n' as string]: STATIONS.length, ['--lc' as string]: 'var(--l4)' }}>
        {STATIONS.map((candidate, candidateIndex) => (
          <li key={candidate} className={candidateIndex < index ? 'passed' : candidateIndex === index ? 'current' : ''} aria-current={candidate === station ? 'step' : undefined}>
            <i />
            <span>{t(`adopt.station.${candidate}`)}</span>
          </li>
        ))}
      </ol>

      {station === 'scan' && (
        <form className="create-form" onSubmit={runScan}>
          <label className="field">
            <span className="eyebrow">{t('adopt.scan.path')}</span>
            <input id="adopt-repo-path" value={repoPath} onChange={(event) => setRepoPath(event.target.value)} placeholder="/home/…/dev/projects/mon-app" required disabled={busy} />
          </label>
          <div className="row"><button type="submit" className="btn" disabled={busy || !repoPath.trim()}>{t('adopt.scan.run')}</button></div>
          {scan && (
            <dl className="facts">
              <dt>{t('adopt.scan.git')}</dt><dd>{scan.isGitRepo ? (scan.defaultBranch ?? '—') : t('adopt.no')}</dd>
              <dt>{t('adopt.scan.origin')}</dt><dd>{scan.hasOrigin ? t('adopt.yes') : t('adopt.scan.noOrigin')}</dd>
              <dt>{t('adopt.scan.packageManager')}</dt><dd>{scan.packageManager ?? '—'}</dd>
              <dt>{t('adopt.scan.ci')}</dt><dd>{scan.ciWorkflows.join(', ') || '—'}</dd>
              <dt>{t('adopt.scan.agentDocs')}</dt><dd>{scan.agentDocs.join(', ') || '—'}</dd>
              <dt>{t('adopt.scan.checks')}</dt><dd>{scan.suggestedVerification.map((check) => check.command).join(' · ') || t('adopt.scan.noChecks')}</dd>
            </dl>
          )}
        </form>
      )}

      {station === 'health' && (
        <div className="create-form">
          <p className="muted">{t('adopt.health.intro')}</p>
          {busy && !health && <p role="status">{t('adopt.health.running')}</p>}
          {health && (
            <ul className="check-results">
              {health.map((check) => (
                <li key={check.name} className={check.ok ? 'ok' : 'ko'}>
                  <b>{check.ok ? '✓' : '✗'} {check.name}</b> <code>{check.command}</code>
                  {!check.ok && <pre className="diagnosis">{check.outputTail}</pre>}
                </li>
              ))}
              {health.length === 0 && <li>{t('adopt.health.none')}</li>}
            </ul>
          )}
        </div>
      )}

      {station === 'import' && (
        <div className="create-form">
          {busy && !proposals && <p role="status">{t('adopt.import.loading')}</p>}
          {proposals && (
            <>
              {proposals.warnings.map((warning) => <p key={warning} className="action-error">{warning}</p>)}
              {proposals.issues.length === 0 && proposals.todos.length === 0 ? (
                <p className="muted">{t('adopt.import.empty')}</p>
              ) : (
                <>
                  <p className="muted">{t('adopt.import.intro')}</p>
                  <fieldset className="field">
                    <legend className="eyebrow">{t('adopt.import.issues', { count: proposals.issues.length })}</legend>
                    {proposals.issues.map((issue) => (
                      <label key={issue.number} className="check">
                        <input id={`issue-${issue.number}`} type="checkbox" checked={pickedIssues.includes(issue.number)}
                          onChange={(event) => setPickedIssues(event.target.checked ? [...pickedIssues, issue.number] : pickedIssues.filter((n) => n !== issue.number))} disabled={busy} />
                        #{issue.number} · {issue.title}
                      </label>
                    ))}
                  </fieldset>
                  {proposals.todos.length > 0 && (
                    <fieldset className="field">
                      <legend className="eyebrow">{t('adopt.import.todos', { count: proposals.todos.length })}</legend>
                      {proposals.todos.map((todo, todoIndex) => (
                        <label key={`${todo.file}:${todo.line}`} className="check">
                          <input id={`todo-${todoIndex}`} type="checkbox" checked={pickedTodos.includes(todoIndex)}
                            onChange={(event) => setPickedTodos(event.target.checked ? [...pickedTodos, todoIndex] : pickedTodos.filter((n) => n !== todoIndex))} disabled={busy} />
                          <code>{todo.file}:{todo.line}</code> {todo.text}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </>
              )}
              <div className="row">
                <label className="field grow">
                  <span className="eyebrow">{t('adopt.import.lineName')}</span>
                  <input id="adopt-line-name" value={line.name} onChange={(event) => setLine({ ...line, name: event.target.value })} disabled={busy} />
                </label>
                <label className="field">
                  <span className="eyebrow">{t('create.line.code')}</span>
                  <input id="adopt-line-code" value={line.code} maxLength={3} size={3} onChange={(event) => setLine({ ...line, code: event.target.value.toUpperCase() })} disabled={busy} />
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {station === 'profile' && (
        <div className="create-form">
          <p className="muted">{t('adopt.profile.intro')}</p>
          {commands.map((command, commandIndex) => (
            <div key={commandIndex} className="row command-row">
              <input aria-label={t('adopt.profile.name')} value={command.name} size={10} disabled={busy}
                onChange={(event) => setCommands(commands.map((c, i) => (i === commandIndex ? { ...c, name: event.target.value } : c)))} />
              <input aria-label={t('adopt.profile.command')} className="grow" value={command.command} disabled={busy}
                onChange={(event) => setCommands(commands.map((c, i) => (i === commandIndex ? { ...c, command: event.target.value } : c)))} />
              {health?.find((check) => check.name === command.name) && (
                <span className={health.find((check) => check.name === command.name)?.ok ? 'good' : 'bad'}>{health.find((check) => check.name === command.name)?.ok ? '✓' : '✗'}</span>
              )}
              <button type="button" className="btn small" aria-label={t('adopt.profile.remove', { name: command.name })} disabled={busy} onClick={() => setCommands(commands.filter((_, i) => i !== commandIndex))}>✕</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn small" disabled={busy} onClick={() => setCommands([...commands, { name: '', command: '' }])}>{t('adopt.profile.add')}</button>
            {commands.length === 0 && <span className="action-error">{t('adopt.profile.empty')}</span>}
          </div>
        </div>
      )}

      {station === 'cutover' && (
        <div className="create-form">
          {!result ? (
            <>
              <label className="field">
                <span className="eyebrow">{t('adopt.cutover.name')}</span>
                <input id="adopt-app-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
              </label>
              <p className="muted">{t('adopt.cutover.summary', { stations: tasks.length, line: line.name, checks: commands.length })}</p>
              {pickedIssues.length > 0 && (
                <label className="check">
                  <input id="adopt-close-issues" type="checkbox" checked={closeIssues} onChange={(event) => setCloseIssues(event.target.checked)} disabled={busy} />
                  {t('adopt.cutover.close', { count: pickedIssues.length })}
                </label>
              )}
              <div className="row">
                <button type="button" className="btn primary" disabled={busy || !name.trim() || !line.name.trim()} onClick={() => void cutOver()}>{t('adopt.cutover.run')}</button>
              </div>
            </>
          ) : (
            <>
              <p>{t('adopt.cutover.done', { name: result.app.name, closed: result.closedIssues.length })}</p>
              {result.closeErrors.map((closeError) => <p key={closeError} className="action-error">{closeError}</p>)}
              <div className="row"><button type="button" className="btn primary" onClick={() => onAdopted(result.app.id)}>{t('adopt.cutover.open')}</button></div>
            </>
          )}
        </div>
      )}

      {error && <p className="action-error" role="alert">{error}</p>}
      {station !== 'cutover' && (
        <div className="row wizard-nav">
          {index > 0 && <button type="button" className="btn" disabled={busy} onClick={() => setStation(STATIONS[index - 1] ?? 'scan')}>{t('adopt.back')}</button>}
          <button type="button" className="btn primary" disabled={busy || (station === 'scan' && !scan) || (station === 'import' && !proposals)} onClick={next}>
            {t('adopt.validate')}
          </button>
        </div>
      )}
    </section>
  );
}
