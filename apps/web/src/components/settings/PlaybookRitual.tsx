import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaybookSkillDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from '../platform/useAction';

export function PlaybookRitual({ onOpenStation }: { onOpenStation: (appId: string, lineId: string, taskId: string) => void }) {
  const { t, i18n } = useTranslation();
  const [skills, setSkills] = useState<readonly PlaybookSkillDto[] | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    let cancelled = false;
    api
      .playbookSkills()
      .then((loaded) => {
        if (!cancelled) setSkills(loaded);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <section className="ritual" aria-labelledby="ritual-title">
      <h3 id="ritual-title">{t('ritual.title')}</h3>
      <p className="muted">{t('ritual.hint')}</p>
      {error && <p className="action-error" role="alert">{error}</p>}
      <ul className="settings-rows">
        {skills?.map((skill) => (
          <li key={skill.name}>
            <span>
              {skill.name} <span className="muted small">{skill.playbook}</span>
            </span>
            <span className="row">
              <span className="muted small">{skill.researched ? t('ritual.researched', { date: date.format(new Date(skill.researched)) }) : t('ritual.never')}</span>
              {skill.stale && <span className="tag warn">{t('ritual.stale')}</span>}
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const started = await api.updateSkill(skill.name);
                    onOpenStation(started.appId, started.task.epicId, started.task.id);
                  })
                }
              >
                {t('ritual.update')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
