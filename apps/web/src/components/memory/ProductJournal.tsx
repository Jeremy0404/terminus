import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppDto, ProductJournalDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from '../platform/useAction';

const EMPTY: ProductJournalDto = { purpose: '', audience: '', outOfScope: '', decisions: '', appUrl: '' };
const FIELDS = ['purpose', 'audience', 'outOfScope', 'decisions', 'appUrl'] as const;

export function ProductJournal({ app }: { app: AppDto }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(app.product ?? EMPTY);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  return <form className="product-journal" onSubmit={(event) => {
    event.preventDefault();
    void run(async () => { setValue(await api.saveProduct(app.id, value)); setSaved(true); });
  }}>
    <h3>{t('journal.title')}</h3><p className="muted">{t('journal.hint')}</p>
    <fieldset disabled={busy}>
      {FIELDS.map((field) => <label className="field" key={field}><span>{t(`journal.${field}`)}</span>
        {field === 'appUrl' ? <input type="url" value={value[field]} maxLength={4000} placeholder="https://" onChange={(event) => { setSaved(false); setValue({ ...value, [field]: event.target.value }); }} />
          : <textarea rows={field === 'decisions' ? 4 : 2} value={value[field]} maxLength={4000} onChange={(event) => { setSaved(false); setValue({ ...value, [field]: event.target.value }); }} />}
      </label>)}
      <button className="btn primary" type="submit">{t('journal.save')}</button>
    </fieldset>
    {saved && <p className="good" role="status">{t('journal.saved')}</p>}
    {error && <p role="alert" className="action-error">{error}</p>}
    {app.brief && <details><summary>{t('journal.brief')}</summary><div className="brief-preview">{app.brief}</div></details>}
  </form>;
}
