import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function suggestCode(name: string, taken: readonly string[]): string {
  const initial = name.trim().charAt(0).toUpperCase();
  if (initial && LETTERS.includes(initial) && !taken.includes(initial)) return initial;
  return [...LETTERS].find((letter) => !taken.includes(letter)) ?? '';
}

export function NewLineForm({ network, onDone }: { network: NetworkDto; onDone: () => void }) {
  const { t } = useTranslation();
  const taken = network.epics.map((epic) => epic.code);
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [planned, setPlanned] = useState(false);
  const { busy, error, run } = useAction();
  const effectiveCode = code ?? suggestCode(name, taken);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      await api.createEpic(network.app.id, { code: effectiveCode, name: name.trim(), status: planned ? 'planned' : 'active' });
      onDone();
    });
  };

  return (
    <form className="create-form" onSubmit={submit} aria-label={t('create.line.title')}>
      <label className="field">
        <span className="eyebrow">{t('create.line.name')}</span>
        <input id="new-line-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="field">
        <span className="eyebrow">{t('create.line.code')}</span>
        <input id="new-line-code" value={effectiveCode} maxLength={3} onChange={(event) => setCode(event.target.value.toUpperCase())} required />
      </label>
      <label className="check">
        <input id="new-line-planned" type="checkbox" checked={planned} onChange={(event) => setPlanned(event.target.checked)} />
        {t('create.line.planned')}
      </label>
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy || !name.trim() || !effectiveCode}>{t('create.line.submit')}</button>
        <button type="button" className="btn" onClick={onDone}>{t('create.cancel')}</button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
    </form>
  );
}
