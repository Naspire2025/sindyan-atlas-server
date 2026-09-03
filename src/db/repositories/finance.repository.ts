import { pool } from '../connection';

export type BudgetLineRow = Record<string, unknown> & { id: string; project_id: string };
export type SpendRecordRow = Record<string, unknown> & { id: string; project_id: string };

export async function findBudgetLine(budgetLineId: string): Promise<BudgetLineRow | undefined> {
  const result = await pool.query('SELECT * FROM project_budget_lines WHERE id = $1', [budgetLineId]);
  return result.rows[0] as BudgetLineRow | undefined;
}

export async function listBudgetLinesForProject(projectId: string): Promise<BudgetLineRow[]> {
  const result = await pool.query('SELECT * FROM project_budget_lines WHERE project_id = $1 ORDER BY effective_date ASC, id ASC', [projectId]);
  return result.rows as BudgetLineRow[];
}

export async function createBudgetLine(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(`
    INSERT INTO project_budget_lines (project_id, category, planned_amount, currency, effective_date, note, created_by_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [input.projectId, input.category, input.plannedAmount, input.currency, input.effectiveDate, input.note, input.createdByUserId]);
  return result.rows[0].id as string;
}

export async function updateBudgetLine(budgetLineId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(`
    UPDATE project_budget_lines
    SET category = $1, planned_amount = $2, currency = $3,
        effective_date = $4, note = $5
    WHERE id = $6
  `, [input.category, input.plannedAmount, input.currency, input.effectiveDate, input.note, budgetLineId]);
}

export async function deleteBudgetLine(budgetLineId: string): Promise<void> {
  await pool.query('DELETE FROM project_budget_lines WHERE id = $1', [budgetLineId]);
}

export async function findSpendRecord(spendRecordId: string): Promise<SpendRecordRow | undefined> {
  const result = await pool.query('SELECT * FROM spend_records WHERE id = $1', [spendRecordId]);
  return result.rows[0] as SpendRecordRow | undefined;
}

export async function listSpendRecordsForProject(projectId: string): Promise<SpendRecordRow[]> {
  const result = await pool.query('SELECT * FROM spend_records WHERE project_id = $1 ORDER BY spent_on ASC, id ASC', [projectId]);
  return result.rows as SpendRecordRow[];
}

export async function createSpendRecord(input: Record<string, unknown>): Promise<string> {
  const result = await pool.query(`
    INSERT INTO spend_records (project_id, spent_on, amount, currency, category, note, recorded_by_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [input.projectId, input.spentOn, input.amount, input.currency, input.category, input.note, input.recordedByUserId]);
  return result.rows[0].id as string;
}

export async function updateSpendRecord(spendRecordId: string, input: Record<string, unknown>): Promise<void> {
  await pool.query(`
    UPDATE spend_records
    SET spent_on = $1, amount = $2, currency = $3,
        category = $4, note = $5, updated_at = NOW()
    WHERE id = $6
  `, [input.spentOn, input.amount, input.currency, input.category, input.note, spendRecordId]);
}

export async function deleteSpendRecord(spendRecordId: string): Promise<void> {
  await pool.query('DELETE FROM spend_records WHERE id = $1', [spendRecordId]);
}

export async function computeFinancialSummary(projectId: string): Promise<{
  budget_allocated_amount: number | null;
  budget_currency: string | null;
  total_planned: number;
  total_spent: number;
  remaining: number | null;
  variance: number | null;
  projected_final_cost: number | null;
  projection_status: 'available' | 'insufficient_data';
  currency: string;
}> {
  const projectResult = await pool.query('SELECT budget_allocated_amount, budget_currency FROM projects WHERE id = $1', [projectId]);
  const project = projectResult.rows[0] as {
    budget_allocated_amount: number | null;
    budget_currency: string | null;
  } | undefined;
  if (!project) return { budget_allocated_amount: null, budget_currency: null, total_planned: 0, total_spent: 0, remaining: null, variance: null, projected_final_cost: null, projection_status: 'insufficient_data', currency: 'USD' };

  const budgetAmount = project.budget_allocated_amount ?? 0;
  const currency = project.budget_currency ?? 'USD';

  const totalsResult = await pool.query(`
    SELECT
      COALESCE(SUM(planned_amount), 0) AS total_planned,
      (SELECT COALESCE(SUM(amount), 0) FROM spend_records WHERE project_id = $1) AS total_spent
    FROM project_budget_lines
    WHERE project_id = $1
  `, [projectId]);
  const totals = totalsResult.rows[0] as { total_planned: number; total_spent: number };

  const remaining = budgetAmount > 0 ? budgetAmount - totals.total_spent : null;
  const variance = budgetAmount > 0 ? budgetAmount - totals.total_spent : null;
  const projectedFinalCost = totals.total_planned > 0 ? Math.max(totals.total_planned, totals.total_spent) : null;

  return {
    budget_allocated_amount: project.budget_allocated_amount,
    budget_currency: project.budget_currency,
    total_planned: totals.total_planned,
    total_spent: totals.total_spent,
    remaining,
    variance,
    projected_final_cost: projectedFinalCost,
    projection_status: projectedFinalCost === null ? 'insufficient_data' : 'available',
    currency,
  };
}
