import type { App } from '../domain/app.js';
import type { Task } from '../domain/task.js';
import { slugOf } from './app-founder.js';
import type { Clock } from './ports/system.js';
import type { TaskNotes } from './ports/task-notes.js';
import type { Vault, VaultNote } from './ports/vault.js';
import type { DecisionRecord } from './stack-output.js';

const INDEX_HEADER = '| Decision | Status | Source |';

export interface ExportHooks {
  briefApproved(app: App, brief: string): void;
  stackApproved(app: App, records: readonly DecisionRecord[], task: Task): void;
  planApproved(app: App, task: Task): void;
  taskMerged(app: App, task: Task): void;
}

export const NO_EXPORT: ExportHooks = { briefApproved: () => {}, stackApproved: () => {}, planApproved: () => {}, taskMerged: () => {} };

export interface VaultExportDeps {
  readonly vault: Vault;
  readonly notes: TaskNotes;
  readonly clock: Clock;
  readonly onError: (error: unknown) => void;
}

export class VaultExport implements ExportHooks {
  constructor(private readonly deps: VaultExportDeps) {}

  briefApproved(app: App, brief: string): void {
    this.safely(() => {
      const { folder } = paths(app);
      const note = frontmatter({ type: 'product-brief', project: slugOf(app.name), status: 'approved', updated: this.today(), tags: '[product, brief]' }) + `${brief.trim()}\n\n## Links\n\n- ${cardLink(app)}\n`;
      this.deps.vault.write([...this.cardIfMissing(app, brief), { path: `${folder}/product/brief.md`, content: note }], `Export the ${app.name} brief from Terminus`);
    });
  }

  stackApproved(app: App, records: readonly DecisionRecord[], task: Task): void {
    if (records.length === 0) return;
    this.safely(() => {
      const { folder } = paths(app);
      const date = this.today();
      const notes = records.map((record): VaultNote & { title: string; name: string } => {
        const name = `${date}-${slugOf(record.slug || record.title)}`;
        return {
          name,
          title: record.title,
          path: `${folder}/decisions/${name}.md`,
          content:
            frontmatter({ type: 'decision', status: 'accepted', project: slugOf(app.name), date, tags: '[decision, architecture]' }) +
            `# ${record.title}\n\n## Context\n\n${record.context}\n\n## Decision\n\n${record.decision}\n\n## Consequences\n\n${record.consequences}\n\n## Links\n\n- ${cardLink(app)} · exported by Terminus from the station « ${task.title} »\n`,
        };
      });
      const index = this.index(app, notes.map((note) => `| ${note.title} | accepted | [[${note.name}]] |`));
      this.deps.vault.write([...this.cardIfMissing(app, app.brief ?? ''), ...notes.map(({ path, content }) => ({ path, content })), index], `Export the ${app.name} architecture decisions from Terminus`);
    });
  }

  planApproved(app: App, task: Task): void {
    this.safely(() => {
      const plan = this.deps.notes.read(task.id, 'plan.md');
      if (!plan?.trim()) return;
      const { folder } = paths(app);
      const date = this.today();
      const body = plan.replace(/^# .*\n+/, '').trim();
      const content =
        frontmatter({ type: 'plan', status: 'active', project: slugOf(app.name), created: date, updated: date, tags: '[plan]', 'terminus-task': task.id }) +
        `# ${task.title}\n\n${body}\n\n## Links\n\n- ${cardLink(app)}\n`;
      this.deps.vault.write([...this.cardIfMissing(app, app.brief ?? ''), { path: `${folder}/active/plan-${date}-${slugOf(task.title).slice(0, 60)}.md`, content }], `Export the plan of « ${task.title} » from Terminus`);
    });
  }

  taskMerged(app: App, task: Task): void {
    this.safely(() => {
      const { folder } = paths(app);
      const marker = `terminus-task: ${task.id}`;
      const plans = this.deps.vault
        .list(`${folder}/active`)
        .map((path) => ({ path, content: this.deps.vault.read(path) ?? '' }))
        .filter((note) => note.content.includes(marker) && /^status: active$/m.test(note.content));
      if (plans.length === 0) return;
      const done = plans.map((note) => ({ path: note.path, content: note.content.replace(/^status: active$/m, 'status: done').replace(/^updated: .*$/m, `updated: ${this.today()}`) }));
      this.deps.vault.write(done, `Mark the plan of « ${task.title} » done from Terminus`);
    });
  }

  private cardIfMissing(app: App, brief: string): VaultNote[] {
    const { card, folder } = paths(app);
    if (this.deps.vault.read(card) !== null) return [];
    const outcome = brief.replace(/^#.*$/gm, '').trim().split(/\n\s*\n/)[0]?.trim() ?? '';
    return [
      {
        path: card,
        content:
          frontmatter({ type: 'project', status: 'active', started: this.today(), tags: '[dev, terminus]' }) +
          `# ${app.name}\n\n## Outcome\n\n${outcome || 'To be framed in Terminus.'}\n\n## Links\n\n- Repository: \`${app.repoPath}\`\n- [[${folder}/product/brief|Product brief]]\n- [[${folder}/decisions/index|Decision index]]\n`,
      },
    ];
  }

  private index(app: App, rows: readonly string[]): VaultNote {
    const { folder } = paths(app);
    const path = `${folder}/decisions/index.md`;
    const existing = this.deps.vault.read(path);
    if (existing === null) {
      const content = frontmatter({ type: 'decision-index', project: slugOf(app.name), status: 'active', updated: this.today(), tags: '[decisions, adr]' }) + `# Decision Index\n\n## Links\n\n- ${cardLink(app)}\n\n${INDEX_HEADER}\n|---|---|---|\n${rows.join('\n')}\n`;
      return { path, content };
    }
    const lines = existing.split('\n');
    const header = lines.findIndex((line) => line.trim() === INDEX_HEADER);
    if (header === -1) return { path, content: `${existing.trimEnd()}\n\n${INDEX_HEADER}\n|---|---|---|\n${rows.join('\n')}\n` };
    let last = header;
    while (last + 1 < lines.length && lines[last + 1]?.trim().startsWith('|')) last += 1;
    lines.splice(last + 1, 0, ...rows);
    return { path, content: lines.join('\n') };
  }

  private today(): string {
    return this.deps.clock.now().slice(0, 10);
  }

  private safely(work: () => void): void {
    try {
      work();
    } catch (error) {
      this.deps.onError(error);
    }
  }
}

function paths(app: App): { folder: string; card: string } {
  const slug = slugOf(app.name);
  return { folder: `Projects/${slug}`, card: `Projects/${slug}.md` };
}

function cardLink(app: App): string {
  return `[[Projects/${slugOf(app.name)}|${app.name}]]`;
}

function frontmatter(fields: Record<string, string>): string {
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n`;
}
