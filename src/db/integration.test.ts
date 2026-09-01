import test from 'node:test';
import assert from 'node:assert/strict';

const { pool } = require('./connection') as typeof import('./connection');
const { runMigrations } = require('./migrate') as typeof import('./migrate');
const { createUser } = require('./repositories/user.repository') as typeof import('./repositories/user.repository');
const { addProjectMember } = require('./repositories/membership.repository') as typeof import('./repositories/membership.repository');
const { createProject } = require('../services/project.service') as typeof import('../services/project.service');

test('Phase 3-8: finance, dashboard, resource, risks, vault integration', async () => {
  await runMigrations();

  const adminId = await createUser({ name: 'Test Admin', emailNormalized: 'admin@test.com', emailDisplay: 'admin@test.com', passwordHash: null, role: 'admin', status: 'active' });
  const leadId = await createUser({ name: 'Project Lead', emailNormalized: 'lead@test.com', emailDisplay: 'lead@test.com', passwordHash: null, role: 'team_member', status: 'active' });
  const memberId = await createUser({ name: 'Team Member', emailNormalized: 'member@test.com', emailDisplay: 'member@test.com', passwordHash: null, role: 'team_member', status: 'active' });
  const suspendedId = await createUser({ name: 'Suspended Member', emailNormalized: 'suspended@test.com', emailDisplay: 'suspended@test.com', passwordHash: null, role: 'team_member', status: 'suspended' });

  const admin = { id: adminId, name: 'Test Admin', email: 'admin@test.com', role: 'admin' as const, status: 'active' as const };
  const lead = { id: leadId, name: 'Project Lead', email: 'lead@test.com', role: 'team_member' as const, status: 'active' as const };
  const member = { id: memberId, name: 'Team Member', email: 'member@test.com', role: 'team_member' as const, status: 'active' as const };

  const project1 = await createProject(admin, {
    name: 'Alpha Project',
    owner_user_id: leadId,
    start_date: '2026-01-01',
    deadline: '2026-03-31',
    links: [
      { label: 'Repository', link_type: 'github', url: 'https://github.com/example/alpha' },
      { label: 'Design', link_type: 'figma', url: 'https://figma.com/file/example' },
    ],
  }) as { id: number };
  const persistedProject = await pool.query('SELECT owner_user_id, start_date, deadline FROM projects WHERE id = $1', [project1.id]);
  assert.deepEqual(persistedProject.rows[0], { owner_user_id: leadId, start_date: '2026-01-01', deadline: '2026-03-31' });
  const project2 = await createProject(admin, { name: 'Beta Project' }) as { id: number };
  const project3 = await createProject(admin, { name: 'Restricted Project' }) as { id: number };
  const projectLinks = await pool.query('SELECT label, link_type, url FROM project_links WHERE project_id = $1 ORDER BY position', [project1.id]);
  assert.deepEqual(projectLinks.rows, [
    { label: 'Repository', link_type: 'github', url: 'https://github.com/example/alpha' },
    { label: 'Design', link_type: 'figma', url: 'https://figma.com/file/example' },
  ]);
  await assert.rejects(
    createProject(member, { name: 'Unauthorized Project' }),
    { message: 'Administrator access is required.' },
  );
  await assert.rejects(
    createProject(admin, { name: 'Invalid Dates', start_date: '2026-02-01', deadline: '2026-01-01' }),
    { message: 'deadline must not be before start_date.' },
  );
  await addProjectMember(project1.id, adminId, 'member');
  await addProjectMember(project1.id, leadId, 'project_lead');
  await addProjectMember(project1.id, memberId, 'member');
  await addProjectMember(project1.id, suspendedId, 'member');
  await addProjectMember(project2.id, memberId, 'member');

  // ── Timeline and milestones ────────────────────────────────────────────────

  const { createProjectPhase, createProjectMilestone, deleteProjectPhase, listProjectMilestones, updateMilestone } =
    require('../services/project-planning.service') as typeof import('../services/project-planning.service');
  const { createTask, updateTask } = require('../services/task.service') as typeof import('../services/task.service');

  const deliveryPhase = await createProjectPhase(lead, project1.id, {
    name: 'Delivery', start_date: '2026-01-01', end_date: '2026-03-31', position: 0,
  });
  const externalPhase = await createProjectPhase(admin, project2.id, {
    name: 'External phase', start_date: '2026-01-01', end_date: '2026-02-01', position: 0,
  });
  const releaseMilestone = await createProjectMilestone(lead, project1.id, {
    title: 'First release', phase_id: deliveryPhase.id, target_date: '2026-03-15', status: 'in_progress',
  });
  const firstTask = await createTask(lead, {
    project_id: project1.id, milestone_id: releaseMilestone.id, assignee_user_id: memberId, title: 'Complete implementation', due_date: '2026-03-01',
  });
  const secondTask = await createTask(lead, {
    project_id: project1.id, assignee_user_id: memberId, title: 'Verify release', due_date: '2026-03-10',
  });
  await updateTask(member, firstTask.id, { status: 'in_progress' });
  await updateTask(member, firstTask.id, { status: 'reviewing' });
  await updateTask(admin, firstTask.id, { status: 'reviewed' });
  await updateTask(admin, firstTask.id, { status: 'done' });
  await updateTask(admin, secondTask.id, { milestone_id: releaseMilestone.id });
  await assert.rejects(updateTask(admin, secondTask.id, { status: 'done' }), { message: 'Task status cannot move from todo to done.' });
  const milestoneProgress = await pool.query(`
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'done') AS done
    FROM tasks WHERE milestone_id = $1
  `, [releaseMilestone.id]);
  assert.deepEqual(milestoneProgress.rows[0], { total: '2', done: '1' });
  const { getProjectTaskSummary, listProjectTasks } = require('./repositories/project.repository') as typeof import('./repositories/project.repository');
  assert.equal((await listProjectTasks(project1.id))[0].assignee_name, 'Team Member');
  assert.deepEqual(await getProjectTaskSummary(project1.id), { total_tasks: 2, done_tasks: 1, blocked_tasks: 0 });
  const { listTasksForUser } = require('./repositories/task.repository') as typeof import('./repositories/task.repository');
  const memberTasks = await listTasksForUser(memberId, false);
  assert.equal(memberTasks.length, 2);
  assert.equal(memberTasks[0].milestone_title, 'First release');
  await assert.rejects(
    createTask(lead, { project_id: project1.id, assignee_user_id: memberId, title: 'Invalid date', due_date: '2026-02-31' }),
    { message: 'due_date must be a valid ISO date.' },
  );
  await assert.rejects(
    createTask(lead, { project_id: project1.id, assignee_user_id: suspendedId, title: 'Inactive owner', due_date: '2026-03-20' }),
    { message: 'The assignee must be an active member of the task project.' },
  );
  const listedMilestones = await listProjectMilestones(member, project1.id);
  assert.equal(listedMilestones[0].phase_name, 'Delivery');
  await updateTask(admin, secondTask.id, { milestone_id: null });
  assert.equal((await pool.query('SELECT milestone_id FROM tasks WHERE id = $1', [secondTask.id])).rows[0].milestone_id, null);
  assert.equal((await updateMilestone(lead, releaseMilestone.id as number, { status: 'done' })).status, 'done');
  await assert.rejects(
    createProjectMilestone(lead, project1.id, { title: 'Wrong phase', phase_id: externalPhase.id, target_date: '2026-03-20' }),
    { message: 'The phase must belong to this project.' },
  );
  await assert.rejects(
    deleteProjectPhase(lead, project1.id, deliveryPhase.id as number),
    { message: 'Move or delete this phase’s milestones before deleting the phase.' },
  );
  await assert.rejects(
    listProjectMilestones(member, project3.id),
    { message: 'Project unavailable.' },
  );

  // ── Finance ─────────────────────────────────────────────────────────────────

  const { listBudgetLines, createBudgetLineRecord, getFinancialSummary } = require('../services/finance.service') as typeof import('../services/finance.service');

  await assert.rejects(
    listBudgetLines(lead, project1.id),
    { message: 'Administrator access is required.' },
  );
  await assert.rejects(
    listBudgetLines(member, project1.id),
    { message: 'Administrator access is required.' },
  );

  const financeLines = await listBudgetLines(admin, project1.id);
  assert.equal(financeLines.length, 0);

  const budgetLine = await createBudgetLineRecord(admin, project1.id, {
    category: 'Engineering',
    planned_amount: 50000,
    currency: 'USD',
    effective_date: '2026-01-01',
  });
  assert.ok(budgetLine);
  assert.equal(budgetLine!.category, 'Engineering');
  assert.equal(budgetLine!.planned_amount, 50000);

  const summary = await getFinancialSummary(admin, project1.id);
  assert.equal(summary.total_planned, 50000);
  assert.equal(summary.total_spent, 0);

  await assert.rejects(
    createBudgetLineRecord(admin, project1.id, { category: 'Test', planned_amount: 100, effective_date: '2026-01-01', currency: '' }),
    { message: 'currency is required.' },
  );

  // ── Dashboard ───────────────────────────────────────────────────────────────

  const stalledTask = await createTask(admin, {
    project_id: project2.id, assignee_user_id: memberId, title: 'Awaiting project update', due_date: '2027-01-15',
  });
  await pool.query("UPDATE tasks SET updated_at = NOW() - INTERVAL '8 days' WHERE id = $1", [stalledTask.id]);
  const { getDashboardAttention, getDashboardOverview } = require('../services/dashboard.service') as typeof import('../services/dashboard.service');
  const overview = await getDashboardOverview(admin);
  assert.equal(overview.kpis.total_projects, 3);
  assert.equal(overview.kpis.active_projects, 0);
  assert.ok(typeof overview.health_score === 'number');
  const attentionItems = await getDashboardAttention(admin);
  assert.ok(attentionItems.some((item) => item.id === secondTask.id && item.item_type === 'task' && String(item.reason).startsWith('Overdue since')));
  assert.ok(attentionItems.some((item) => item.id === stalledTask.id && item.item_type === 'task' && item.reason === 'No update in 7 days'));

  // ── Resource Allocation ─────────────────────────────────────────────────────

  const {
    createCapacityProfileRecord,
    listUserCapacityProfiles,
    createAssetRecord,
    listAssetRecords,
    createMemberAllocationRecord,
    listMemberAllocationRecords,
  } = require('../services/resource.service') as typeof import('../services/resource.service');

  await assert.rejects(
    createCapacityProfileRecord(lead, 3, { effective_from: '2026-01-01', weekly_capacity_hours: 40 }),
    { message: 'Administrator access is required.' },
  );
  await assert.rejects(
    createAssetRecord(lead, { name: 'Server', asset_type: 'hardware' }),
    { message: 'Administrator access is required.' },
  );

  const profile = await createCapacityProfileRecord(admin, 3, { effective_from: '2026-01-01', weekly_capacity_hours: 40 });
  assert.ok(profile);
  assert.equal((await listUserCapacityProfiles(admin, 3)).length, 1);

  const asset = await createAssetRecord(admin, { name: 'GPU Server', asset_type: 'hardware' });
  assert.ok(asset);
  assert.equal((await listAssetRecords(admin)).length, 1);

  const allocation = await createMemberAllocationRecord(admin, {
    project_id: project1.id,
    user_id: memberId,
    starts_on: '2026-01-01',
    ends_on: '2026-03-31',
    allocation_percent: 50,
  });
  assert.ok(allocation);
  assert.equal((await listMemberAllocationRecords(admin, {})).length, 1);

  await assert.rejects(
    createMemberAllocationRecord(admin, {
      project_id: project1.id,
      user_id: memberId,
      starts_on: '2026-02-01',
      ends_on: '2026-04-30',
      allocation_percent: 60,
    }),
    { message: 'Allocation exceeds the member\u2019s available capacity.' },
  );

  // ── Risks and Issues ────────────────────────────────────────────────────────

  const { createRiskRecord, listProjectRisks, deleteRiskRecord, createIssueRecord, listProjectIssues } =
    require('../services/risk-issue.service') as typeof import('../services/risk-issue.service');

  await assert.rejects(
    createRiskRecord(member, project1.id, { title: 'Test Risk', severity: 'high', probability: 'medium' }),
    { message: 'Project lead access is required.' },
  );

  const risk = await createRiskRecord(lead, project1.id, { title: 'Budget overrun', severity: 'high', probability: 'medium' });
  assert.ok(risk);

  assert.equal((await listProjectRisks(member, project1.id)).length, 1);

  await assert.rejects(
    deleteRiskRecord(lead, risk.id),
    { message: 'Administrator access is required.' },
  );

  await deleteRiskRecord(admin, risk.id);
  assert.equal((await listProjectRisks(admin, project1.id)).length, 0);

  const issue = await createIssueRecord(lead, project1.id, { title: 'Build failure', priority: 'high' });
  assert.ok(issue);
  assert.equal((await listProjectIssues(member, project1.id)).length, 1);

  // ── Vault ───────────────────────────────────────────────────────────────────

  process.env.VAULT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const { createEntry, listEntries, setEntryTags, getEntryTags } =
    require('../services/vault.service') as typeof import('../services/vault.service');

  const vaultEntry = await createEntry(member, { entry_type: 'markdown_note', title: 'Team notes', markdown_content: '# Notes' });
  assert.ok(vaultEntry);
  assert.ok((await listEntries(member, {})).length >= 1);

  const hiddenEntry = await createEntry(admin, { entry_type: 'markdown_note', title: 'Restricted note', project_id: project3.id });
  assert.ok(hiddenEntry);
  assert.equal((await listEntries(member, {})).some((entry: any) => entry.id === hiddenEntry.id), false);

  await assert.rejects(
    createEntry(lead, { entry_type: 'credential', title: 'API Key' }),
    { message: 'Administrator access is required.' },
  );

  const credentialEntry = await createEntry(admin, { entry_type: 'credential', title: 'Prod API Key', secret_value: 'test-secret' });
  assert.ok(credentialEntry);

  await assert.rejects(
    (require('../services/vault.service') as typeof import('../services/vault.service')).revealSecret(lead, credentialEntry.id),
    { message: 'Administrator access is required.' },
  );

  const tags = await setEntryTags(admin, vaultEntry.id, { tags: ['important', 'team'] });
  assert.equal(tags.length, 2);
  assert.equal((await getEntryTags(member, vaultEntry.id)).length, 2);

  await assert.rejects(
    (require('../services/vault.service') as typeof import('../services/vault.service')).archiveEntry(lead, vaultEntry.id),
    { message: 'Administrator access is required.' },
  );

  // ── Schema ──────────────────────────────────────────────────────────────────

  const tablesResult = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  const tableNames = new Set(tablesResult.rows.map((r: any) => r.tablename));
  for (const name of ['project_budget_lines', 'spend_records', 'member_capacity_profiles', 'member_availability',
    'project_member_allocations', 'assets', 'asset_allocations', 'risks', 'issues',
    'vault_entries', 'vault_tags', 'vault_entry_tags', 'vault_secrets', 'vault_files', 'vault_audit_log']) {
    assert.ok(tableNames.has(name), `table ${name} should exist`);
  }
});
