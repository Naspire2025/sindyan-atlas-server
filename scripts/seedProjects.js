const seedData = require('../seeds/sindyan-projects-2026-2027.json');

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_STATUSES = new Set(['planning', 'active', 'on_hold', 'blocked', 'completed', 'cancelled']);

function validateSeedData(data) {
  if (!Array.isArray(data.projects) || data.projects.length === 0) {
    throw new Error('Seed data must contain at least one project.');
  }

  const projectNames = new Set();
  for (const project of data.projects) {
    if (!project.name?.trim()) throw new Error('Every seed project requires a name.');
    if (projectNames.has(project.name.toLowerCase())) throw new Error(`Duplicate seed project: ${project.name}`);
    if (!VALID_PRIORITIES.has(project.priority)) throw new Error(`Invalid priority for ${project.name}`);
    if (!VALID_STATUSES.has(project.status)) throw new Error(`Invalid status for ${project.name}`);

    const taskTitles = new Set();
    for (const title of project.tasks ?? []) {
      if (!title?.trim()) throw new Error(`Empty task title in ${project.name}`);
      if (taskTitles.has(title.toLowerCase())) throw new Error(`Duplicate task in ${project.name}: ${title}`);
      taskTitles.add(title.toLowerCase());
    }
    projectNames.add(project.name.toLowerCase());
  }
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

      for (const title of project.tasks ?? []) {
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

async function seedPostgres(data) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL seeding.');

  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    throw new Error('PostgreSQL seeding requires the pg package. Install it with: npm install pg');
  }

  const client = new Client({ connectionString });
  const stats = { projectsCreated: 0, projectsUpdated: 0, tasksCreated: 0, tasksExisting: 0 };
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS website_url TEXT');

    for (const project of data.projects) {
      const values = toProjectValues(project);
      const existing = await client.query('SELECT id FROM projects WHERE LOWER(name) = LOWER($1) ORDER BY id LIMIT 1', [project.name]);
      let projectId;

      if (existing.rows[0]) {
        projectId = existing.rows[0].id;
        await client.query(`
          UPDATE projects SET description = $1, owner = $2, priority = $3,
            website_url = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [values.description, values.owner, values.priority, values.website_url, projectId]);
        stats.projectsUpdated += 1;
      } else {
        const inserted = await client.query(`
          INSERT INTO projects (name, description, owner, status, priority, website_url)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [values.name, values.description, values.owner, values.status, values.priority, values.website_url]);
        projectId = inserted.rows[0].id;
        stats.projectsCreated += 1;
      }

      for (const title of project.tasks ?? []) {
        const task = await client.query('SELECT id FROM tasks WHERE project_id = $1 AND LOWER(title) = LOWER($2) LIMIT 1', [projectId, title]);
        if (task.rows[0]) {
          stats.tasksExisting += 1;
          continue;
        }
        await client.query(`
          INSERT INTO tasks (project_id, title, owner, status, priority)
          VALUES ($1, $2, $3, 'todo', $4)
        `, [projectId, title, data.taskOwner || null, project.priority]);
        stats.tasksCreated += 1;
      }
    }

    await client.query('COMMIT');
    return stats;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
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
  console.log(`Projects: ${stats.projectsCreated} created, ${stats.projectsUpdated} updated.`);
  console.log(`Tasks: ${stats.tasksCreated} created, ${stats.tasksExisting} already present.`);
}

async function main() {
  validateSeedData(seedData);
  const database = process.argv.includes('--database=postgres') ? 'postgres' : 'sqlite';

  if (process.argv.includes('--dry-run')) {
    const taskCount = seedData.projects.reduce((total, project) => total + project.tasks.length, 0);
    console.log(`Validated ${seedData.projects.length} projects and ${taskCount} tasks from ${seedData.source}.`);
    return;
  }

  const stats = database === 'postgres' ? await seedPostgres(seedData) : seedSqlite(seedData);
  printSummary(database, stats);
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
