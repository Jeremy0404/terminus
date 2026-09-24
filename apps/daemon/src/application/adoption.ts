import type { App, VerificationCommand } from '../domain/app.js';
import { DomainError } from '../domain/errors.js';
import type { Catalog } from './catalog.js';
import type { CheckResult, CheckRunner } from './ports/check-runner.js';
import type { IssueTracker, OpenIssue } from './ports/issue-tracker.js';
import type { RepoScan, RepoScanner } from './ports/repo-scanner.js';
import type { AppRepository } from './ports/repositories.js';

export interface Proposals {
  readonly issues: readonly OpenIssue[];
  readonly todos: RepoScan['todos'];
  readonly warnings: readonly string[];
}

export interface CutOverPlan {
  readonly name: string;
  readonly repoPath: string;
  readonly verification: readonly VerificationCommand[];
  readonly lines: readonly {
    readonly code: string;
    readonly name: string;
    readonly tasks: readonly { readonly title: string; readonly issueNumber?: number | undefined }[];
  }[];
  readonly closeIssues: boolean;
}

export interface CutOverResult {
  readonly app: App;
  readonly closedIssues: readonly number[];
  readonly closeErrors: readonly string[];
}

export class Adoption {
  constructor(
    private readonly scanner: RepoScanner,
    private readonly checks: CheckRunner,
    private readonly issues: IssueTracker,
    private readonly catalog: Catalog,
    private readonly apps: AppRepository,
  ) {}

  scan(repoPath: string): RepoScan {
    this.refuseAdopted(repoPath);
    return this.scanner.scan(repoPath);
  }

  health(repoPath: string, commands: readonly VerificationCommand[]): Promise<CheckResult[]> {
    return this.checks.run(repoPath, commands);
  }

  proposals(repoPath: string): Proposals {
    const scan = this.scanner.scan(repoPath);
    const warnings: string[] = [];
    let issues: OpenIssue[] = [];
    if (scan.hasOrigin) {
      try {
        issues = this.issues.listOpen(repoPath);
      } catch (error) {
        warnings.push(`GitHub issues could not be read: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      warnings.push('No origin remote: GitHub issues cannot be imported and pull requests cannot be opened.');
    }
    return { issues, todos: scan.todos, warnings };
  }

  cutOver(plan: CutOverPlan): CutOverResult {
    this.refuseAdopted(plan.repoPath);
    if (plan.lines.length === 0) throw new DomainError('Adopt at least one line');
    const app = this.catalog.createApp({ name: plan.name, repoPath: plan.repoPath, verification: plan.verification });
    const imported: { issueNumber: number; taskId: string }[] = [];
    for (const line of plan.lines) {
      const epic = this.catalog.createEpic(app.id, { code: line.code, name: line.name, status: 'active' });
      for (const task of line.tasks) {
        const created = this.catalog.createTask(epic.id, { title: task.title, dependsOn: [], autonomy: 'up-to-pr' });
        if (task.issueNumber !== undefined) imported.push({ issueNumber: task.issueNumber, taskId: created.id });
      }
    }
    const closedIssues: number[] = [];
    const closeErrors: string[] = [];
    if (plan.closeIssues) {
      for (const { issueNumber, taskId } of imported) {
        try {
          this.issues.close(plan.repoPath, issueNumber, `Now tracked in Terminus as task ${taskId}.`);
          closedIssues.push(issueNumber);
        } catch (error) {
          closeErrors.push(`#${issueNumber}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return { app, closedIssues, closeErrors };
  }

  private refuseAdopted(repoPath: string): void {
    const existing = this.apps.list().find((app) => app.repoPath === repoPath);
    if (existing) throw new DomainError(`${repoPath} is already adopted as ${existing.name}`);
  }
}
