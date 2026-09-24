import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { EFFORTS } from '../../domain/agent-choice.js';
import type { VerificationCommand } from '../../domain/app.js';
import type { Breakdown } from '../../domain/epic.js';
import type { DecisionAnswer, DecisionOption, Proposal } from '../../domain/decision.js';
import type { Failure } from '../../domain/failure.js';
import type { PhaseDefinition } from '../../domain/lifecycle.js';
import type { QuotaWindow } from '../../domain/quota.js';
import type { TaskStatus } from '../../domain/task.js';

export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoPath: text('repo_path').notNull(),
  verification: text('verification', { mode: 'json' }).$type<VerificationCommand[]>().notNull().default([]),
  createdAt: text('created_at').notNull(),
});

export const epics = sqliteTable(
  'epics',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull().references(() => apps.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: text('status', { enum: ['planned', 'active', 'delivered'] }).notNull(),
    position: integer('position').notNull(),
    description: text('description').notNull().default(''),
    breakdown: text('breakdown', { mode: 'json' }).$type<Breakdown>().notNull().default({ status: 'idle' }),
  },
  (table) => [index('epics_app_idx').on(table.appId)],
);

export const playbookVersions = sqliteTable(
  'playbook_versions',
  {
    lifecycleId: text('lifecycle_id').notNull(),
    version: text('version').notNull(),
    phases: text('phases', { mode: 'json' }).$type<PhaseDefinition[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.lifecycleId, table.version] })],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    epicId: text('epic_id').notNull().references(() => epics.id),
    title: text('title').notNull(),
    lifecycleId: text('lifecycle_id').notNull(),
    lifecycleVersion: text('lifecycle_version').notNull(),
    autonomy: text('autonomy', { enum: ['step-by-step', 'up-to-pr', 'up-to-merge'] }).notNull(),
    track: text('track', { enum: ['standard', 'light'] }).notNull().default('standard'),
    phaseIndex: integer('phase_index').notNull(),
    status: text('status', { mode: 'json' }).$type<TaskStatus>().notNull(),
    failuresInPhase: text('failures_in_phase', { mode: 'json' }).$type<Failure[]>().notNull(),
    checkFailures: text('check_failures', { mode: 'json' }).$type<Failure[]>().notNull().default([]),
    model: text('model'),
    effort: text('effort', { enum: EFFORTS }),
  },
  (table) => [index('tasks_epic_idx').on(table.epicId)],
);

export const taskDependencies = sqliteTable(
  'task_dependencies',
  {
    taskId: text('task_id').notNull().references(() => tasks.id),
    dependsOn: text('depends_on').notNull().references(() => tasks.id),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependsOn] })],
);

export const checkpoints = sqliteTable(
  'checkpoints',
  {
    taskId: text('task_id').notNull().references(() => tasks.id),
    sequence: integer('sequence').notNull(),
    phaseIndex: integer('phase_index').notNull(),
    ref: text('ref').notNull(),
    sessionId: text('session_id'),
    takenAt: text('taken_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.sequence] })],
);

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull().references(() => tasks.id),
    phaseIndex: integer('phase_index').notNull(),
    sessionId: text('session_id').notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed', 'interrupted'] }).notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    output: text('output', { mode: 'json' }).$type<unknown>(),
    model: text('model'),
    effort: text('effort', { enum: EFFORTS }),
  },
  (table) => [index('runs_task_idx').on(table.taskId)],
);

export const decisions = sqliteTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull().references(() => tasks.id),
    phaseIndex: integer('phase_index').notNull(),
    kind: text('kind', { enum: ['question', 'deviation', 'proposal'] }).notNull().default('question'),
    question: text('question').notNull(),
    options: text('options', { mode: 'json' }).$type<DecisionOption[]>().notNull(),
    answer: text('answer', { mode: 'json' }).$type<DecisionAnswer>(),
    createdAt: text('created_at').notNull(),
    answeredAt: text('answered_at'),
    proposal: text('proposal', { mode: 'json' }).$type<Proposal>(),
  },
  (table) => [index('decisions_task_idx').on(table.taskId)],
);

export const quota = sqliteTable('quota', {
  id: text('id').primaryKey(),
  limited: integer('limited', { mode: 'boolean' }).notNull(),
  windows: text('windows', { mode: 'json' }).$type<QuotaWindow[]>().notNull(),
  observedAt: text('observed_at').notNull(),
});

export const agentDefaults = sqliteTable('agent_defaults', {
  phaseId: text('phase_id').primaryKey(),
  model: text('model'),
  effort: text('effort', { enum: EFFORTS }),
});
