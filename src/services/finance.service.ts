import {
  createBudgetLine,
  createSpendRecord,
  deleteBudgetLine,
  deleteSpendRecord,
  findBudgetLine,
  findSpendRecord,
  listBudgetLinesForProject,
  listSpendRecordsForProject,
  updateBudgetLine,
  updateSpendRecord,
  computeFinancialSummary,
} from '../db/repositories/finance.repository';
import { findProject } from '../db/repositories/project.repository';
import type { AuthenticatedUser } from '../types/auth';
import { AppError } from '../utils/app-error.util';
import { requireAdmin, requireProjectAccess } from './project-access.service';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, `${field} is required.`);
  return value.trim();
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) throw new AppError(400, `${field} must be a valid ISO date.`);
  return value;
}

function requiredAmount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new AppError(400, `${field} must be a non-negative number.`);
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(400, 'Invalid text value.');
  return value.trim() || null;
}

async function requireExistingProject(projectId: number): Promise<void> {
  if (!(await findProject(projectId))) throw new AppError(404, 'Project unavailable.');
}

async function requireProjectCurrency(projectId: number, currency: string): Promise<void> {
  const project = await findProject(projectId) as { budget_currency?: string | null } | undefined;
  if (project?.budget_currency && project.budget_currency !== currency) {
    throw new AppError(400, `currency must match the project currency (${project.budget_currency}).`);
  }
}

export async function listBudgetLines(user: AuthenticatedUser, projectId: number) {
  requireAdmin(user);
  await requireExistingProject(projectId);
  return listBudgetLinesForProject(projectId);
}

export async function createBudgetLineRecord(user: AuthenticatedUser, projectId: number, body: unknown) {
  requireAdmin(user);
  await requireExistingProject(projectId);
  const input = body as Record<string, unknown>;
  const category = requiredText(input.category, 'category');
  const plannedAmount = requiredAmount(input.planned_amount, 'planned_amount');
  const currency = input.currency === undefined ? 'USD' : requiredText(input.currency, 'currency');
  await requireProjectCurrency(projectId, currency);
  const effectiveDate = requiredDate(input.effective_date, 'effective_date');
  const note = optionalText(input.note);

  const budgetLineId = await createBudgetLine({
    projectId,
    category,
    plannedAmount,
    currency,
    effectiveDate,
    note,
    createdByUserId: user.id,
  });
  return findBudgetLine(budgetLineId);
}

export async function updateBudgetLineRecord(user: AuthenticatedUser, budgetLineId: number, body: unknown) {
  requireAdmin(user);
  const existing = await findBudgetLine(budgetLineId);
  if (!existing) throw new AppError(404, 'Budget line unavailable.');
  const input = body as Record<string, unknown>;
  const category = input.category === undefined ? String(existing.category) : requiredText(input.category, 'category');
  const plannedAmount = input.planned_amount === undefined ? Number(existing.planned_amount) : requiredAmount(input.planned_amount, 'planned_amount');
  const currency = input.currency === undefined ? String(existing.currency) : requiredText(input.currency, 'currency');
  await requireProjectCurrency(existing.project_id, currency);
  const effectiveDate = input.effective_date === undefined ? String(existing.effective_date) : requiredDate(input.effective_date, 'effective_date');
  const note = input.note === undefined ? existing.note ?? null : optionalText(input.note);

  await updateBudgetLine(budgetLineId, { category, plannedAmount, currency, effectiveDate, note });
  return findBudgetLine(budgetLineId);
}

export async function deleteBudgetLineRecord(user: AuthenticatedUser, budgetLineId: number): Promise<void> {
  requireAdmin(user);
  const existing = await findBudgetLine(budgetLineId);
  if (!existing) throw new AppError(404, 'Budget line unavailable.');
  await deleteBudgetLine(budgetLineId);
}

export async function listSpendRecords(user: AuthenticatedUser, projectId: number) {
  requireAdmin(user);
  await requireExistingProject(projectId);
  return listSpendRecordsForProject(projectId);
}

export async function createSpendRecordRecord(user: AuthenticatedUser, projectId: number, body: unknown) {
  requireAdmin(user);
  await requireExistingProject(projectId);
  const input = body as Record<string, unknown>;
  const spentOn = requiredDate(input.spent_on, 'spent_on');
  const amount = requiredAmount(input.amount, 'amount');
  const currency = input.currency === undefined ? 'USD' : requiredText(input.currency, 'currency');
  await requireProjectCurrency(projectId, currency);
  const category = requiredText(input.category, 'category');
  const note = optionalText(input.note);

  const spendRecordId = await createSpendRecord({
    projectId,
    spentOn,
    amount,
    currency,
    category,
    note,
    recordedByUserId: user.id,
  });
  return findSpendRecord(spendRecordId);
}

export async function updateSpendRecordRecord(user: AuthenticatedUser, spendRecordId: number, body: unknown) {
  requireAdmin(user);
  const existing = await findSpendRecord(spendRecordId);
  if (!existing) throw new AppError(404, 'Spend record unavailable.');
  const input = body as Record<string, unknown>;
  const spentOn = input.spent_on === undefined ? String(existing.spent_on) : requiredDate(input.spent_on, 'spent_on');
  const amount = input.amount === undefined ? Number(existing.amount) : requiredAmount(input.amount, 'amount');
  const currency = input.currency === undefined ? String(existing.currency) : requiredText(input.currency, 'currency');
  await requireProjectCurrency(existing.project_id, currency);
  const category = input.category === undefined ? String(existing.category) : requiredText(input.category, 'category');
  const note = input.note === undefined ? existing.note ?? null : optionalText(input.note);

  await updateSpendRecord(spendRecordId, { spentOn, amount, currency, category, note });
  return findSpendRecord(spendRecordId);
}

export async function deleteSpendRecordRecord(user: AuthenticatedUser, spendRecordId: number): Promise<void> {
  requireAdmin(user);
  const existing = await findSpendRecord(spendRecordId);
  if (!existing) throw new AppError(404, 'Spend record unavailable.');
  await deleteSpendRecord(spendRecordId);
}

export async function getFinancialSummary(user: AuthenticatedUser, projectId: number) {
  requireAdmin(user);
  await requireExistingProject(projectId);
  return computeFinancialSummary(projectId);
}
