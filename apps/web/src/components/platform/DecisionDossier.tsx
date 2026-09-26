import { useTranslation } from 'react-i18next';
import type { NetworkDto, TaskDetailDto } from '@terminus/contracts';

export function previewLinks(content: string | undefined): { before?: string; after?: string } {
  try {
    const value: unknown = JSON.parse(content ?? 'null');
    if (!value || typeof value !== 'object') return {};
    const links: { before?: string; after?: string } = {};
    for (const key of ['before', 'after'] as const) {
      if (!(key in value)) continue;
      const candidate = Reflect.get(value, key);
      if (typeof candidate !== 'string') continue;
      try {
        const url = new URL(candidate);
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) links[key] = url.href;
      } catch { continue; }
    }
    return links;
  } catch { return {}; }
}

const SERVER_PHASE = 'server';
const SERVER_CHECKLIST = 'checklist.md';

const DOCUMENT_LABELS: Readonly<Record<string, string>> = {
  'spec.md': 'dossier.spec',
  'plan.md': 'dossier.plan',
  [SERVER_CHECKLIST]: 'dossier.checklist',
};

export function DecisionDossier({ detail, network }: { detail: TaskDetailDto; network: NetworkDto }) {
  const { t } = useTranslation();
  const { task } = detail;
  const status = task.status;
  const epic = network.epics.find((line) => line.id === task.epicId);
  const product = network.app.product;
  const decision = status.kind === 'awaiting-decision' ? detail.decisions.find((item) => item.id === status.decisionId) : null;
  const awaiting = status.kind === 'awaiting-gate' || status.kind === 'awaiting-decision';
  const phase = task.phases[task.phaseIndex];
  const effect = status.kind === 'awaiting-decision' ? 'answer' : status.kind === 'awaiting-gate' && status.gate === 'merge' ? 'merge' : phase === SERVER_PHASE ? 'server' : phase === 'brief' ? 'brief' : phase === 'architecture' ? 'architecture' : status.kind === 'awaiting-gate' && status.gate === 'plan-approval' ? 'plan' : 'approve';
  const docs = (detail.documents ?? []).filter((doc) => doc.name !== 'preview.json');
  const previews = previewLinks(detail.documents?.find((doc) => doc.name === 'preview.json')?.content);
  return <section className="decision-dossier">
    {awaiting && <><span className="eyebrow">{t('dossier.eyebrow')}</span><h3>{t('dossier.title')}</h3>
      <dl><dt>{t('dossier.proposal')}</dt><dd>{decision?.question || task.title}</dd>
        <dt>{t('dossier.benefit')}</dt><dd>{epic?.description || product?.purpose || t('dossier.unspecified')}</dd>
        <dt>{t('dossier.consequence')}</dt><dd>{t(`dossier.effect.${effect}`)}</dd></dl>
      <p className="muted">{t('dossier.verify')}</p>
    </>}
    {(product?.purpose || product?.audience || product?.outOfScope || product?.decisions || epic?.description) && <details className="product-context" open={awaiting}>
      <summary>{t('dossier.context')}</summary>
      {epic?.description && <p><b>{epic.name}</b> — {epic.description}</p>}
      {(['purpose', 'audience', 'outOfScope', 'decisions'] as const).map((key) => product?.[key] && <p key={key}><b>{t(`journal.${key}`)}</b><br />{product[key]}</p>)}
    </details>}
    {(awaiting || docs.length > 0) && <details className="dossier-documents" open={phase === SERVER_PHASE}><summary>{t('dossier.documents', { count: docs.length })}</summary>
      {docs.length === 0 && <p className="muted">{t('dossier.noDocuments')}</p>}
      {docs.map((doc) => <details key={doc.name} open={phase === SERVER_PHASE && doc.name === SERVER_CHECKLIST}><summary>{t(DOCUMENT_LABELS[doc.name] ?? 'dossier.plan')}</summary><pre className="brief-preview">{doc.content}</pre>{doc.truncated && <p className="muted">{t('dossier.truncated')}</p>}</details>)}
    </details>}
    {(previews.before || previews.after) && <div className="row preview-links">{(['before', 'after'] as const).map((key) => previews[key] && <a className="btn" key={key} href={previews[key]} target="_blank" rel="noreferrer">{t(`dossier.${key}`)}</a>)}</div>}
  </section>;
}
