import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppDto, MemoryDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useServerEvents } from '../../api/events';
import { useAction } from '../platform/useAction';
import { ProductJournal } from './ProductJournal';

export function ProjectMemory({ app, onClose }: { app: AppDto; onClose: () => void }) {
  const { t } = useTranslation();
  const [memory, setMemory] = useState<MemoryDto | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [lesson, setLesson] = useState('');
  const { busy, error, run } = useAction();
  useServerEvents((event) => {
    if (event.type === 'memory-changed' && event.appId === app.id) setVersion((current) => current + 1);
  });

  useEffect(() => {
    let cancelled = false;
    api
      .memory(app.id)
      .then((loaded) => {
        if (!cancelled) setMemory(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [app.id, version]);

  const change = (action: () => Promise<unknown>, reset?: () => void): void => {
    void run(async () => {
      await action();
      reset?.();
      setVersion((current) => current + 1);
    });
  };

  return (
    <section className="card memory" aria-labelledby="memory-title">
      <div className="platform-head">
        <div>
          <span className="eyebrow">{t('memory.eyebrow')}</span>
          <h2 id="memory-title">{app.name}</h2>
          <p className="muted">{t('memory.hint')}</p>
        </div>
        <button type="button" className="btn small" onClick={onClose} aria-label={t('memory.close')}>✕</button>
      </div>
      <ProductJournal app={app} />
      {loadError && <p className="action-error" role="alert">{loadError}</p>}
      {memory && (
        <>
          {memory.proposals.length > 0 && (
            <>
              <h3>{t('memory.proposals.title')}</h3>
              <ul className="memory-list proposals">
                {memory.proposals.map((proposal) => (
                  <li key={proposal.id}>
                    <span>
                      <span className="eyebrow">{t(`memory.proposals.${proposal.proposed.kind}`, { task: proposal.sourceTitle })}</span>
                      {proposal.proposed.kind === 'lesson' && proposal.proposed.text}
                      {proposal.proposed.kind === 'term' && <><b>{proposal.proposed.term}</b> {proposal.proposed.definition}</>}
                      {proposal.proposed.kind === 'obsolete' && <b>{proposal.proposed.targetTitle}</b>}
                      {proposal.why && <span className="muted small proposal-why">{proposal.why}</span>}
                    </span>
                    <span className="row">
                      <button type="button" className="btn small primary" disabled={busy} onClick={() => change(() => api.acceptProposal(proposal.id))}>
                        {t(proposal.proposed.kind === 'obsolete' ? 'memory.proposals.close' : 'memory.proposals.accept')}
                      </button>
                      <button type="button" className="btn small" disabled={busy} onClick={() => change(() => api.dismissProposal(proposal.id))}>
                        {t(proposal.proposed.kind === 'obsolete' ? 'memory.proposals.keep' : 'memory.proposals.dismiss')}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>{t('memory.terms.title')}</h3>
          <ul className="memory-list">
            {memory.terms.map((entry) => (
              <li key={entry.id}>
                <span><b>{entry.term}</b> {entry.definition}</span>
                <button type="button" className="btn small subtle" disabled={busy} aria-label={t('memory.remove', { what: entry.term })} onClick={() => change(() => api.removeTerm(entry.id))}>✕</button>
              </li>
            ))}
            {memory.terms.length === 0 && <li className="muted">{t('memory.terms.empty')}</li>}
          </ul>
          <form
            className="memory-form"
            onSubmit={(event) => {
              event.preventDefault();
              change(() => api.setTerm(app.id, term, definition), () => {
                setTerm('');
                setDefinition('');
              });
            }}
          >
            <input aria-label={t('memory.terms.term')} placeholder={t('memory.terms.term')} value={term} maxLength={80} onChange={(event) => setTerm(event.target.value)} />
            <input aria-label={t('memory.terms.definition')} placeholder={t('memory.terms.definition')} value={definition} maxLength={600} onChange={(event) => setDefinition(event.target.value)} />
            <button type="submit" className="btn small" disabled={busy || !term.trim() || !definition.trim()}>{t('memory.add')}</button>
          </form>

          <h3>{t('memory.lessons.title')}</h3>
          <ul className="memory-list">
            {memory.lessons.map((entry) => (
              <li key={entry.id}>
                <span>{entry.text}</span>
                <button type="button" className="btn small subtle" disabled={busy} aria-label={t('memory.remove', { what: entry.text })} onClick={() => change(() => api.removeLesson(entry.id))}>✕</button>
              </li>
            ))}
            {memory.lessons.length === 0 && <li className="muted">{t('memory.lessons.empty')}</li>}
          </ul>
          <form
            className="memory-form"
            onSubmit={(event) => {
              event.preventDefault();
              change(() => api.addLesson(app.id, lesson), () => setLesson(''));
            }}
          >
            <input aria-label={t('memory.lessons.new')} placeholder={t('memory.lessons.new')} value={lesson} maxLength={600} onChange={(event) => setLesson(event.target.value)} />
            <button type="submit" className="btn small" disabled={busy || !lesson.trim()}>{t('memory.add')}</button>
          </form>
          {error && <p className="action-error" role="alert">{error}</p>}

          <details className="memory-pack">
            <summary>{t('memory.pack')}</summary>
            <pre className="run-log">{memory.pack || t('memory.packEmpty')}</pre>
          </details>
        </>
      )}
    </section>
  );
}
