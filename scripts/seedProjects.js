const seedData = require('../seeds/sindyan-projects-2026-2027.json');

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_PROJECT_STATUSES = new Set(['planning', 'active', 'on_hold', 'blocked', 'completed', 'cancelled']);
const VALID_TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'reviewing', 'reviewed', 'done']);
const VALID_MILESTONE_STATUSES = new Set(['not_started', 'in_progress', 'done', 'missed']);
const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_PROBABILITIES = new Set(['low', 'medium', 'high']);
const VALID_RISK_ISSUE_STATUSES = new Set(['open', 'mitigating', 'escalated', 'resolved']);
const VALID_PROJECT_ROLES = new Set(['member', 'project_lead']);
const VALID_AVAILABILITY_STATUSES = new Set(['available', 'unavailable', 'reduced_capacity']);
const KNOWN_USER_IDS = new Set([1, 2, 3, 4, 5]);

const uuidByKey = new Map();

async function hashPassword(plaintext) {
  try {
    const argon2 = require('argon2');
    return await argon2.hash(plaintext, { type: argon2.argon2id });
  } catch {
    return null;
  }
}

function resolvedUserId(numericId) {
  const uuid = uuidByKey.get(Number(numericId));
  if (!uuid) throw new Error(`Seed references unknown user id ${numericId}.`);
  return uuid;
}

function assertEnum(set, value, label) {
  if (!set.has(value)) throw new Error(`Invalid ${label}: ${value}`);
}

function validateSeedData(data) {
  if (!Array.isArray(data.projects) || data.projects.length === 0) {
    throw new Error('Seed data must contain at least one project.');
  }
  if (!data.creatorUserId) throw new Error('Seed data requires a creatorUserId.');

  const projectNames = new Set();
  for (const project of data.projects) {
    if (!project.name?.trim()) throw new Error('Every seed project requires a name.');
    if (projectNames.has(project.name.toLowerCase())) throw new Error(`Duplicate seed project: ${project.name}`);
    projectNames.add(project.name.toLowerCase());
    if (!VALID_PRIORITIES.has(project.priority)) throw new Error(`Invalid priority for ${project.name}`);
    if (!VALID_PROJECT_STATUSES.has(project.status)) throw new Error(`Invalid status for ${project.name}`);

    if (project.phases) {
      const phaseNames = new Set();
      for (const phase of project.phases) {
        if (!phase.name?.trim()) throw new Error(`Empty phase in ${project.name}`);
        if (phaseNames.has(phase.name.toLowerCase())) throw new Error(`Duplicate phase in ${project.name}: ${phase.name}`);
        phaseNames.add(phase.name.toLowerCase());
      }
    }

    if (project.milestones) {
      const titles = new Set();
      for (const milestone of project.milestones) {
        if (!milestone.title?.trim()) throw new Error(`Empty milestone in ${project.name}`);
        if (titles.has(milestone.title.toLowerCase())) throw new Error(`Duplicate milestone in ${project.name}: ${milestone.title}`);
        titles.add(milestone.title.toLowerCase());
        assertEnum(VALID_MILESTONE_STATUSES, milestone.status, `milestone status in ${project.name}`);
      }
    }

    if (project.tasks) {
      const titles = new Set();
      for (const task of project.tasks) {
        if (!task.title?.trim()) throw new Error(`Empty task title in ${project.name}`);
        if (titles.has(task.title.toLowerCase())) throw new Error(`Duplicate task in ${project.name}: ${task.title}`);
        titles.add(task.title.toLowerCase());
        assertEnum(VALID_TASK_STATUSES, task.status, `task status in ${project.name}`);
        assertEnum(VALID_PRIORITIES, task.priority, `task priority in ${project.name}`);
      }
    }

    for (const member of project.members || []) {
      if (!KNOWN_USER_IDS.has(Number(member.userId))) throw new Error(`Unknown member userId in ${project.name}: ${member.userId}`);
      assertEnum(VALID_PROJECT_ROLES, member.projectRole, `member role in ${project.name}`);
    }

    for (const task of project.tasks || []) {
      if (task.assigneeUserId != null && !KNOWN_USER_IDS.has(Number(task.assigneeUserId))) {
        throw new Error(`Unknown assignee in ${project.name}: ${task.assigneeUserId}`);
      }
    }

    for (const risk of project.risks || []) {
      if (risk.ownerUserId != null && !KNOWN_USER_IDS.has(Number(risk.ownerUserId))) {
        throw new Error(`Unknown risk owner in ${project.name}: ${risk.ownerUserId}`);
      }
      assertEnum(VALID_SEVERITIES, risk.severity, `risk severity in ${project.name}`);
      assertEnum(VALID_PROBABILITIES, risk.probability, `risk probability in ${project.name}`);
      assertEnum(VALID_RISK_ISSUE_STATUSES, risk.status, `risk status in ${project.name}`);
    }

    for (const issue of project.issues || []) {
      if (issue.ownerUserId != null && !KNOWN_USER_IDS.has(Number(issue.ownerUserId))) {
        throw new Error(`Unknown issue owner in ${project.name}: ${issue.ownerUserId}`);
      }
      assertEnum(VALID_PRIORITIES, issue.priority, `issue priority in ${project.name}`);
      assertEnum(VALID_RISK_ISSUE_STATUSES, issue.status, `issue status in ${project.name}`);
    }
  }
}

function withSslMode(connectionString) {
  if (/[?&]sslmode=/.test(connectionString)) return connectionString;
  const separator = connectionString.includes('?') ? '&' : '?';
  return `${connectionString}${separator}sslmode=require`;
}

async function seedPostgres(data) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL seeding.');

  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    throw new Error('PostgreSQL seeding requires the pg package. Install it with: npm install pg');
  }

  const client = new Client({ connectionString: withSslMode(connectionString) });
  const stats = {
    users: 0,
    projectsCreated: 0, projectsUpdated: 0,
    phases: 0, milestones: 0, tasks: 0, memberships: 0, links: 0,
    budgetLines: 0, spendRecords: 0, risks: 0, issues: 0, allocations: 0,
    assetsCreated: 0, assetAllocations: 0, capacityProfiles: 0, availability: 0,
  };
  let creatorUserId;
  const seedPassword = process.env.SEED_USER_PASSWORD;
  await client.connect();

  const seedUsers = async () => {
    const team = [
      { key: 1, name: 'Abdulsalam', email: 'abdulsalam@sindyan.team', role: 'admin' },
      { key: 2, name: 'Ayesha', email: 'ayesha@sindyan.team', role: 'admin' },
      { key: 3, name: 'Bilal', email: 'bilal@sindyan.team', role: 'team_member' },
      { key: 4, name: 'Fatima', email: 'fatima@sindyan.team', role: 'team_member' },
    ];
    const passwordHash = seedPassword ? await hashPassword(seedPassword) : null;
    for (const user of team) {
      const result = await client.query(
        `INSERT INTO users (name, email_normalized, email_display, password_hash, role, status)
         VALUES ($1, LOWER($2), $2, $3, $4, 'active')
         ON CONFLICT (email_normalized) DO UPDATE SET
           name = EXCLUDED.name,
           email_display = EXCLUDED.email_display,
           password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
           role = EXCLUDED.role,
           status = 'active',
           updated_at = NOW()
         RETURNING id`,
        [user.name, user.email, passwordHash, user.role],
      );
      uuidByKey.set(user.key, result.rows[0].id);
      stats.users += 1;
    }
    creatorUserId = resolvedUserId(data.creatorUserId);
  };

  const clearProjectChildren = async (projectId) => {
    await client.query('DELETE FROM tasks WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM milestones WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM project_phases WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM project_links WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM project_budget_lines WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM spend_records WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM risks WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM issues WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM project_memberships WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM project_member_allocations WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM asset_allocations WHERE project_id = $1', [projectId]);
  };

  const linkTaskToMilestone = async (projectId, milestoneTitle) => {
    if (!milestoneTitle) return null;
    const result = await client.query('SELECT id FROM milestones WHERE project_id = $1 AND LOWER(title) = LOWER($2) ORDER BY id LIMIT 1', [projectId, milestoneTitle]);
    return result.rows[0] ? result.rows[0].id : null;
  };

  try {
    await client.query('BEGIN');

    if (process.argv.includes('--reset')) {
      await client.query('DELETE FROM member_availability');
      await client.query('DELETE FROM member_capacity_profiles');
      await client.query('DELETE FROM projects');
      await client.query('DELETE FROM assets');
    }

    await seedUsers();

    for (const project of data.projects) {
      const existing = await client.query('SELECT id FROM projects WHERE LOWER(name) = LOWER($1) ORDER BY id LIMIT 1', [project.name]);
      let projectId;

      if (existing.rows[0]) {
        projectId = existing.rows[0].id;
        await client.query(`
          UPDATE projects SET description = $1, owner = $2, owner_user_id = $3, status = $4,
            priority = $5, start_date = $6, deadline = $7, website_url = $8,
            budget_allocated_amount = $9, budget_currency = $10, updated_at = CURRENT_TIMESTAMP
          WHERE id = $11
        `, [
          project.description?.trim() || null, project.owner?.trim() || null,
          project.ownerUserId != null ? resolvedUserId(project.ownerUserId) : null,
          project.status, project.priority, project.startDate || null, project.deadline || null,
          project.websiteUrl || null, project.budgetAmount ?? null, project.budgetCurrency || null, projectId,
        ]);
        stats.projectsUpdated += 1;
        await clearProjectChildren(projectId);
      } else {
        const inserted = await client.query(`
          INSERT INTO projects (name, description, owner, owner_user_id, status, priority, start_date, deadline, website_url, budget_allocated_amount, budget_currency)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `, [
          project.name.trim(), project.description?.trim() || null, project.owner?.trim() || null,
          project.ownerUserId != null ? resolvedUserId(project.ownerUserId) : null, project.status, project.priority, project.startDate || null,
          project.deadline || null, project.websiteUrl || null, project.budgetAmount ?? null,
          project.budgetCurrency || null,
        ]);
        projectId = inserted.rows[0].id;
        stats.projectsCreated += 1;
      }

      const phaseIdByName = new Map();
      for (const phase of project.phases || []) {
        const result = await client.query(`
          INSERT INTO project_phases (project_id, name, position, start_date, end_date)
          VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [projectId, phase.name.trim(), phase.position ?? 0, phase.startDate || null, phase.endDate || null]);
        phaseIdByName.set(phase.name.toLowerCase(), result.rows[0].id);
        stats.phases += 1;
      }

      const milestoneIdByTitle = new Map();
      for (const milestone of project.milestones || []) {
        const result = await client.query(`
          INSERT INTO milestones (project_id, phase_id, title, target_date, status)
          VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [projectId, phaseIdByName.get(milestone.phase?.toLowerCase()) ?? null, milestone.title.trim(), milestone.targetDate || null, milestone.status]);
        milestoneIdByTitle.set(milestone.title.toLowerCase(), result.rows[0].id);
        stats.milestones += 1;
      }

      for (const member of project.members || []) {
        await client.query(`
          INSERT INTO project_memberships (project_id, user_id, project_role)
          VALUES ($1, $2, $3)
          ON CONFLICT(project_id, user_id) DO UPDATE SET project_role = excluded.project_role
        `, [projectId, resolvedUserId(member.userId), member.projectRole]);
        stats.memberships += 1;
      }

      for (const task of project.tasks || []) {
        await client.query(`
          INSERT INTO tasks (project_id, milestone_id, assignee_user_id, title, description, owner, status, priority, due_date, estimated_hours, blocker_note)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          projectId, milestoneIdByTitle.get(task.milestone?.toLowerCase()) ?? null,
          task.assigneeUserId != null ? resolvedUserId(task.assigneeUserId) : null,
          task.title.trim(), task.description || null, task.owner || project.owner || data.taskOwner || null,
          task.status, task.priority, task.dueDate || null, task.estimatedHours ?? null,
          task.blocker_note || null,
        ]);
        stats.tasks += 1;
      }

      for (const link of project.links || []) {
        await client.query(`
          INSERT INTO project_links (project_id, label, link_type, url, position, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [projectId, link.label || link.url, link.linkType || 'external', link.url, link.position ?? 0, creatorUserId]);
        stats.links += 1;
      }

      for (const line of project.budgetLines || []) {
        await client.query(`
          INSERT INTO project_budget_lines (project_id, category, planned_amount, currency, effective_date, note, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [projectId, line.category, line.plannedAmount, line.currency || 'USD', line.effectiveDate, line.note || null, creatorUserId]);
        stats.budgetLines += 1;
      }

      for (const spend of project.spendRecords || []) {
        await client.query(`
          INSERT INTO spend_records (project_id, spent_on, amount, currency, category, note, recorded_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [projectId, spend.spentOn, spend.amount, spend.currency || 'USD', spend.category, spend.note || null, creatorUserId]);
        stats.spendRecords += 1;
      }

      for (const risk of project.risks || []) {
        await client.query(`
          INSERT INTO risks (project_id, title, description, severity, probability, owner_user_id, due_date, status, mitigation_progress, mitigation_note, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          projectId, risk.title, risk.description || null, risk.severity, risk.probability,
          risk.ownerUserId != null ? resolvedUserId(risk.ownerUserId) : null,
          risk.dueDate || null, risk.status, risk.mitigationProgress ?? 0,
          risk.mitigationNote || null, creatorUserId,
        ]);
        stats.risks += 1;
      }

      for (const issue of project.issues || []) {
        await client.query(`
          INSERT INTO issues (project_id, title, description, priority, owner_user_id, target_resolution_date, status, resolution_progress, resolution_note, created_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          projectId, issue.title, issue.description || null, issue.priority,
          issue.ownerUserId != null ? resolvedUserId(issue.ownerUserId) : null,
          issue.targetResolutionDate || null, issue.status, issue.resolutionProgress ?? 0,
          issue.resolutionNote || null, creatorUserId,
        ]);
        stats.issues += 1;
      }
    }

    await seedResources(client, data, stats, creatorUserId);

    await client.query('COMMIT');
    return stats;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function seedResources(client, data, stats, creatorUserId) {
  const assets = [
    { name: 'Production Web Server', assetType: 'server', status: 'available', capacityDescription: '2 vCPU / 8GB RAM, hosts client-facing web apps.' },
    { name: 'Shared Drive Storage', assetType: 'storage', status: 'available', capacityDescription: '5TB object storage for project files and backups.' },
    { name: 'CI/CD Runner', assetType: 'tooling', status: 'available', capacityDescription: 'Build and deployment pipeline for web and app projects.' },
    { name: 'Design License Pool', assetType: 'software', status: 'available', capacityDescription: 'Shared seat pool for Figma and Adobe CC.' },
  ];

  const allocatedAssets = ['Production Web Server', 'Shared Drive Storage', 'CI/CD Runner', 'Design License Pool'];

  for (const index in assets) {
    const asset = assets[index];
    const result = await client.query(`
      INSERT INTO assets (name, asset_type, status, capacity_description)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [asset.name, asset.assetType, asset.status, asset.capacityDescription]);
    const assetId = result.rows[0].id;
    stats.assetsCreated += 1;

    const project = data.projects[index % data.projects.length];
    if (!allocatedAssets.includes(asset.name)) continue;
    const allocationResult = await client.query(`
      SELECT id FROM projects WHERE LOWER(name) = LOWER($1) ORDER BY id LIMIT 1
    `, [project.name]);
    if (!allocationResult.rows[0]) continue;
    await client.query(`
      INSERT INTO asset_allocations (asset_id, project_id, starts_on, ends_on, allocation_percent, note, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [assetId, allocationResult.rows[0].id, project.startDate || '2026-01-01', project.deadline || '2027-12-31', 100, `Assigned for ${project.name}.`, creatorUserId]);
    stats.assetAllocations += 1;
  }

  const capacity = [
    { userId: 3, weeklyHours: 32 },
    { userId: 4, weeklyHours: 40 },
    { userId: 1, weeklyHours: 24 },
  ];
  for (const profile of capacity) {
    await client.query(`
      INSERT INTO member_capacity_profiles (user_id, effective_from, weekly_capacity_hours, created_by_user_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, effective_from) DO UPDATE SET weekly_capacity_hours = excluded.weekly_capacity_hours
    `, [resolvedUserId(profile.userId), '2026-01-01', profile.weeklyHours, creatorUserId]);
    stats.capacityProfiles += 1;
  }

  const availability = [
    { userId: 4, startsOn: '2026-01-01', endsOn: '2026-12-31', hours: 40, status: 'available', note: 'Full-time contributor.' },
    { userId: 3, startsOn: '2026-01-01', endsOn: '2026-06-30', hours: 24, status: 'reduced_capacity', note: 'Splitting time across critical projects.' },
    { userId: 1, startsOn: '2026-01-01', endsOn: '2026-12-31', hours: 20, status: 'available', note: 'Executive oversight and reviews.' },
  ];
  for (const entry of availability) {
    await client.query(`
      INSERT INTO member_availability (user_id, starts_on, ends_on, capacity_hours, availability_status, note, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [resolvedUserId(entry.userId), entry.startsOn, entry.endsOn, entry.hours, entry.status, entry.note, creatorUserId]);
    stats.availability += 1;
  }

  let allocationCount = 0;
  for (const project of data.projects) {
    const projectResult = await client.query('SELECT id, start_date, deadline FROM projects WHERE LOWER(name) = LOWER($1) ORDER BY id LIMIT 1', [project.name]);
    if (!projectResult.rows[0]) continue;
    const start = projectResult.rows[0].start_date || '2026-01-01';
    const end = projectResult.rows[0].deadline || '2027-12-31';
    for (const member of project.members || []) {
      if (member.projectRole !== 'project_lead') continue;
      await client.query(`
        INSERT INTO project_member_allocations (project_id, user_id, starts_on, ends_on, allocation_percent, planned_hours)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [projectResult.rows[0].id, resolvedUserId(member.userId), start, end, 40, 8]);
      allocationCount += 1;
    }
  }
  stats.allocations += allocationCount;

  return { tasks: 0 };
}

function seedSqlite(data) {
  const db = require('../db');
  const stats = { projectsCreated: 0, projectsUpdated: 0, tasksCreated: 0, tasksExisting: 0 };
  const findProject = db.prepare('SELECT id FROM projects WHERE LOWER(name) = LOWER(?) ORDER BY id LIMIT 1');
  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, owner, status, priority, website_url)
    VALUES (@name, @description, @owner, @status, @priority, @website_url)
  `);
  const updateProject = db.prepare(`
    UPDATE projects SET description = @description, owner = @owner, priority = @priority,
      website_url = @website_url, updated_at = datetime('now')
    WHERE id = @id
  `);
  const findTask = db.prepare('SELECT id FROM tasks WHERE project_id = ? AND LOWER(title) = LOWER(?) LIMIT 1');
  const insertTask = db.prepare(`
    INSERT INTO tasks (project_id, title, owner, status, priority)
    VALUES (?, ?, ?, 'todo', ?)
  `);

  const transaction = db.transaction(() => {
    for (const project of data.projects) {
      const values = toProjectValues(project);
      const existing = findProject.get(project.name);
      let projectId;

      if (existing) {
        projectId = existing.id;
        updateProject.run({ ...values, id: projectId });
        stats.projectsUpdated += 1;
      } else {
        projectId = Number(insertProject.run(values).lastInsertRowid);
        stats.projectsCreated += 1;
      }

      for (const task of project.tasks ?? []) {
        const title = task.title ?? task;
        if (findTask.get(projectId, title)) {
          stats.tasksExisting += 1;
          continue;
        }
        insertTask.run(projectId, title, data.taskOwner || null, project.priority);
        stats.tasksCreated += 1;
      }
    }
  });

  transaction();
  return stats;
}

function toProjectValues(project) {
  return {
    name: project.name.trim(),
    description: project.description?.trim() || null,
    owner: project.owner?.trim() || null,
    status: project.status,
    priority: project.priority,
    website_url: project.websiteUrl || null,
  };
}

function printSummary(database, stats) {
  console.log(`Seeded ${seedData.source} into ${database}.`);
  console.log(`Users: ${stats.users}  Projects: ${stats.projectsCreated} created, ${stats.projectsUpdated} updated${process.argv.includes('--reset') ? ' (reset)' : ''}.`);
  console.log(`Phases: ${stats.phases}  Milestones: ${stats.milestones}  Tasks: ${stats.tasks}`);
  console.log(`Memberships: ${stats.memberships}  Links: ${stats.links}  Allocations: ${stats.allocations}`);
  console.log(`Budget lines: ${stats.budgetLines}  Spend records: ${stats.spendRecords}`);
  console.log(`Risks: ${stats.risks}  Issues: ${stats.issues}`);
  console.log(`Assets: ${stats.assetsCreated}  Asset allocations: ${stats.assetAllocations}`);
  console.log(`Capacity profiles: ${stats.capacityProfiles}  Availability: ${stats.availability}`);
}

async function main() {
  validateSeedData(seedData);
  const database = process.argv.includes('--database=sqlite') ? 'sqlite' : 'postgres';

  if (process.argv.includes('--dry-run')) {
    const taskCount = seedData.projects.reduce((total, project) => total + (project.tasks || []).length, 0);
    const milestoneCount = seedData.projects.reduce((total, project) => total + (project.milestones || []).length, 0);
    const riskCount = seedData.projects.reduce((total, project) => total + (project.risks || []).length, 0);
    const issueCount = seedData.projects.reduce((total, project) => total + (project.issues || []).length, 0);
    console.log(`Validated ${seedData.projects.length} projects, ${milestoneCount} milestones, ${taskCount} tasks, ${riskCount} risks, and ${issueCount} issues from ${seedData.source}.`);
    return;
  }

  if (database === 'sqlite') {
    printSummary(database, seedSqlite(seedData));
    return;
  }

  const stats = await seedPostgres(seedData);
  printSummary(database, stats);
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
