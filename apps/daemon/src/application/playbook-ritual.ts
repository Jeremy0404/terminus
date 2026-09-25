import type { App } from '../domain/app.js';
import { DomainError } from '../domain/errors.js';
import type { Task } from '../domain/task.js';
import type { Catalog } from './catalog.js';
import type { PlaybookSkill, SkillCatalog } from './ports/skill-catalog.js';
import type { AppRepository, EpicRepository, TaskRepository } from './ports/repositories.js';
import type { Clock } from './ports/system.js';

export const RITUAL_LINE = { code: 'PB', name: 'Playbooks' } as const;
export const STALE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export interface RitualSkill extends PlaybookSkill {
  readonly stale: boolean;
}

export interface PlaybookRitualDeps {
  readonly skills: SkillCatalog;
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly catalog: Catalog;
  readonly clock: Clock;
  readonly playbooksRepo: string;
}

export class PlaybookRitual {
  constructor(private readonly deps: PlaybookRitualDeps) {}

  list(): RitualSkill[] {
    const now = Date.parse(this.deps.clock.now());
    return this.deps.skills
      .skills()
      .map((skill) => ({ ...skill, stale: skill.researched === null || now - Date.parse(skill.researched) > STALE_AFTER_DAYS * DAY_MS }))
      .sort((a, b) => (a.researched ?? '').localeCompare(b.researched ?? '') || a.name.localeCompare(b.name));
  }

  update(skillName: string): { readonly app: App; readonly task: Task } {
    const skill = this.deps.skills.skills().find((candidate) => candidate.name === skillName);
    if (!skill) throw new DomainError(`No playbook skill ${skillName}`);
    const app = this.deps.apps.list().find((candidate) => sameFolder(candidate.repoPath, this.deps.playbooksRepo));
    if (!app) throw new DomainError(`Adopt the repository that holds the playbooks (${this.deps.playbooksRepo}) before running the ritual`);
    const title = `Mettre à jour la skill ${skill.name}`;
    const open = this.deps.tasks.listByApp(app.id).find((task) => task.title === title && task.status.kind !== 'done' && task.status.kind !== 'closed');
    if (open) throw new DomainError(`The ${skill.name} skill already has an update in progress`);
    const line =
      this.deps.epics.listByApp(app.id).find((epic) => epic.code === RITUAL_LINE.code) ??
      this.deps.catalog.createEpic(app.id, { ...RITUAL_LINE, status: 'active', description: 'Rituel de mise à jour des playbooks : une station par skill, relue comme une pull request.' });
    const task = this.deps.catalog.createTask(line.id, {
      title,
      description: `Skill playbooks/${skill.playbook}/skills/${skill.name}/, recherchée le ${skill.researched ?? 'jamais'}.`,
      dependsOn: [],
      autonomy: 'up-to-pr',
      lifecycleId: 'playbook-update',
    });
    return { app, task };
  }
}

function sameFolder(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}
