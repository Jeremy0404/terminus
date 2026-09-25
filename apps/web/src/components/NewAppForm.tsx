import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

export function NewAppForm({ onCancel, onFounded }: { onCancel: () => void; onFounded: (appId: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [idea, setIdea] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const { busy, error, run } = useAction();

  return (
    <form
      className="card new-app"
      aria-labelledby="new-app-title"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => onFounded((await api.foundApp({ name, idea, repoPath, visibility })).id));
      }}
    >
      <span className="eyebrow">{t('found.eyebrow')}</span>
      <h2 id="new-app-title">{t('found.title')}</h2>
      <label className="field">
        <span>{t('found.name')}</span>
        <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>{t('found.idea')}</span>
        <textarea className="free-answer brief" value={idea} maxLength={4000} placeholder={t('found.ideaPlaceholder')} onChange={(event) => setIdea(event.target.value)} />
      </label>
      <label className="field">
        <span>{t('found.folder')}</span>
        <input value={repoPath} placeholder={t('found.folderPlaceholder')} onChange={(event) => setRepoPath(event.target.value)} />
      </label>
      <label className="field">
        <span>{t('found.visibility')}</span>
        <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'public')}>
          <option value="private">{t('found.private')}</option>
          <option value="public">{t('found.public')}</option>
        </select>
      </label>
      {error && <p className="action-error" role="alert">{error}</p>}
      <div className="row wizard-nav">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>{t('create.cancel')}</button>
        <button type="submit" className="btn primary" disabled={busy || !name.trim() || !idea.trim()}>{t('found.submit')}</button>
      </div>
    </form>
  );
}
