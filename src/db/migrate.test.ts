import test from 'node:test';
import assert from 'node:assert/strict';

const { pool } = require('./connection') as typeof import('./connection');
const { runMigrations } = require('./migrate') as typeof import('./migrate');
const { createUser } = require('./repositories/user.repository') as typeof import('./repositories/user.repository');
const { addProjectMember } = require('./repositories/membership.repository') as typeof import('./repositories/membership.repository');
const { hashPassword } = require('../utils/password.util') as typeof import('../utils/password.util');
const { login, changePassword } = require('../services/auth.service') as typeof import('../services/auth.service');
const { createProject } = require('../services/project.service') as typeof import('../services/project.service');
const { createTask, updateTask } = require('../services/task.service') as typeof import('../services/task.service');
const { createProjectLink, createProjectMilestone, createProjectPhase, deleteMilestone, listProjectLinks, updateMilestone } = require('../services/project-planning.service') as typeof import('../services/project-planning.service');

test('migrations create the access-control, vault, and single-session foundations', async () => {
  await runMigrations();

  const result = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  const tableNames = new Set(result.rows.map((r: any) => r.tablename));
  assert.ok(tableNames.has('users'));
  assert.ok(tableNames.has('project_memberships'));
  assert.ok(tableNames.has('vault_files'));

  const adminId = await createUser({
    name: 'Test Admin',
    emailNormalized: 'admin@example.test',
    emailDisplay: 'admin@example.test',
    passwordHash: await hashPassword('A-strong-password-123'),
    role: 'admin',
    status: 'active',
  });
  await login({ email: 'admin@example.test', password: 'A-strong-password-123' });
  await login({ email: 'admin@example.test', password: 'A-strong-password-123' });
  const activeSessionsResult = await pool.query('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL');
  assert.equal(Number(activeSessionsResult.rows[0].count), 1);

  const leadId = await createUser({ name: 'Project Lead', emailNormalized: 'lead@example.test', emailDisplay: 'lead@example.test', passwordHash: null, role: 'team_member', status: 'active' });
  const memberId = await createUser({ name: 'Team Member', emailNormalized: 'member@example.test', emailDisplay: 'member@example.test', passwordHash: null, role: 'team_member', status: 'active' });
  const admin = { id: adminId, name: 'Test Admin', email: 'admin@example.test', role: 'admin' as const, status: 'active' as const };
  const lead = { id: leadId, name: 'Project Lead', email: 'lead@example.test', role: 'team_member' as const, status: 'active' as const };
  const member = { id: memberId, name: 'Team Member', email: 'member@example.test', role: 'team_member' as const, status: 'active' as const };
  const project = await createProject(admin, { name: 'Role verification project' });
  await addProjectMember(project.id, leadId, 'project_lead');
  await addProjectMember(project.id, memberId, 'member');
  const task = await createTask(lead, { project_id: project.id, assignee_user_id: memberId, title: 'Verify access', due_date: '2026-01-20' });
  assert.equal((await updateTask(member, task.id, { status: 'in_progress' })).status, 'in_progress');
  await assert.rejects(updateTask(member, task.id, { priority: 'critical' }), { message: 'Project lead access is required.' });
  assert.equal((await updateTask(lead, task.id, { priority: 'high' })).priority, 'high');
  await assert.rejects(updateTask(lead, task.id, { status: 'done' }), { message: 'Only an administrator can review or complete a task.' });
  await assert.rejects(updateTask(admin, task.id, { status: 'done' }), { message: 'Task status cannot move from in_progress to done.' });
  assert.equal((await updateTask(member, task.id, { status: 'reviewing' })).status, 'reviewing');
  assert.equal((await updateTask(admin, task.id, { status: 'reviewed' })).status, 'reviewed');
  assert.equal((await updateTask(admin, task.id, { status: 'done' })).status, 'done');
  await assert.rejects(
    createTask(lead, { project_id: project.id, assignee_user_id: memberId, title: 'Invalid deadline', due_date: '2026-02-31' }),
    { message: 'due_date must be a valid ISO date.' },
  );

  const phase = await createProjectPhase(lead, project.id, { name: 'Delivery', position: 0, start_date: '2026-01-01', end_date: '2026-01-31' });
  const milestone = await createProjectMilestone(lead, project.id, { title: 'First release', phase_id: phase.id, target_date: '2026-01-31' });
  assert.equal((await updateMilestone(lead, milestone.id as string, { status: 'in_progress' })).status, 'in_progress');
  await assert.rejects(deleteMilestone(lead, milestone.id as string), { message: 'Administrator access is required.' });
  await deleteMilestone(admin, milestone.id as string);
  await createProjectLink(lead, project.id, { label: 'Project brief', link_type: 'brief', url: 'https://example.test/brief', position: 0 });
  assert.equal((await listProjectLinks(member, project.id)).length, 1);
  await assert.rejects(createProjectLink(member, project.id, { label: 'Denied', link_type: 'brief', url: 'https://example.test/denied' }), { message: 'Project lead access is required.' });

  await changePassword(admin, 'A-strong-password-123', 'A-different-password-456');
  await assert.rejects(login({ email: 'admin@example.test', password: 'A-strong-password-123' }), { message: 'Invalid email or password.' });
  await login({ email: 'admin@example.test', password: 'A-different-password-456' });
  const sessionCountResult = await pool.query('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL');
  assert.equal(Number(sessionCountResult.rows[0].count), 1);
});
