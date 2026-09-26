import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IdeaContentDto, IdeaDraftDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

const EMPTY: IdeaContentDto = { name: '', audience: '', problem: '', outcome: '' };
const FIELDS = ['name', 'audience', 'problem', 'outcome'] as const;

export function IdeasWorkshop({ onCancel, onFounded }: { onCancel: () => void; onFounded: (id: string) => void }) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<IdeaDraftDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [id, setId] = useState<string>();
  const [value, setValue] = useState(EMPTY);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const { busy, error, run } = useAction();
  useEffect(() => {
    let cancelled = false;
    api.ideas().then((ideas) => { if (!cancelled) { setDrafts(ideas); setLoaded(true); setLoadError(false); } }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [revision]);
  const save = async (): Promise<IdeaDraftDto> => {
    const draft = await api.saveIdea(value, id);
    setId(draft.id); setValue(draft); setSaved(true); setDirty(false);
    setDrafts((previous) => [draft, ...previous.filter((item) => item.id !== draft.id)]);
    return draft;
  };
  const navigate = (action: () => void): void => { void run(async () => { if (dirty) await save(); action(); }); };
  return <section className="card idea-workshop">
    <div className="platform-head"><div><span className="eyebrow">{t('ideas.eyebrow')}</span><h2>{t('ideas.title')}</h2></div><button className="btn" disabled={busy} onClick={() => navigate(onCancel)}>{t('ideas.close')}</button></div>
    <p className="muted">{t('ideas.hint')}</p>
    <div className="idea-layout"><aside>
      <h3>{t('ideas.drafts')}</h3>
      {!loaded && !loadError && <p role="status">{t('app.loading')}</p>}
      {loadError && <p role="alert">{t('ideas.loadError')} <button className="btn small" onClick={() => setRevision((n) => n + 1)}>{t('platform.retry')}</button></p>}
      <button className="btn" disabled={busy} onClick={() => navigate(() => { setId(undefined); setValue(EMPTY); setSaved(false); setLaunching(false); setRepoPath(''); setVisibility('private'); })}>{t('ideas.new')}</button>
      <ul className="journey-list">{drafts.map((draft) => <li key={draft.id}><button className="btn" disabled={busy} aria-pressed={id === draft.id} onClick={() => { if (id !== draft.id) navigate(() => { setId(draft.id); setValue(draft); setSaved(true); setDirty(false); setLaunching(false); setRepoPath(''); setVisibility('private'); }); }}>{draft.name || t('ideas.untitled')}</button></li>)}</ul>
    </aside><form onSubmit={(event) => { event.preventDefault(); void run(save); }}>
      <fieldset disabled={busy}>
        {FIELDS.map((field) => <label className="field" key={field}><span>{t(`ideas.${field}`)}</span>
          <textarea rows={field === 'name' ? 1 : 2} value={value[field]} maxLength={field === 'name' ? 80 : 1200} onChange={(event) => { setValue({ ...value, [field]: event.target.value }); setSaved(false); setDirty(true); setLaunching(false); }} />
        </label>)}
        <div className="row"><button className="btn" type="submit">{t('ideas.save')}</button><button className="btn primary" type="button" disabled={!FIELDS.every((field) => value[field].trim())} onClick={() => void run(async () => { await save(); setLaunching(true); })}>{t('ideas.prepare')}</button></div>
      </fieldset>
      {saved && <p role="status" className="good">{t('ideas.saved')}</p>}
      {launching && <section className="idea-launch">
        <h3>{t('ideas.route')}</h3><ol className="idea-route"><li>{t('ideas.frame')}</li><li>{t('ideas.architecture')}</li><li>{t('ideas.scaffold')}</li><li>{t('ideas.deploy')}</li></ol>
        <p>{t('ideas.consequence')}</p>
        <fieldset disabled={busy}>
          <label className="field"><span>{t('found.folder')}</span><input value={repoPath} placeholder={t('found.folderPlaceholder')} onChange={(event) => setRepoPath(event.target.value)} /></label>
          <label className="field"><span>{t('found.visibility')}</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'public')}><option value="private">{t('found.private')}</option><option value="public">{t('found.public')}</option></select></label>
          <button className="btn primary" type="button" onClick={() => id && void run(async () => onFounded((await api.launchIdea(id, { visibility, repoPath })).id))}>{t('ideas.launch')}</button>
        </fieldset>
      </section>}
      {error && <p className="action-error" role="alert">{error}</p>}
    </form></div>
  </section>;
}
