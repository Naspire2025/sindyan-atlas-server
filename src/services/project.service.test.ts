import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/connection';
import { createProject } from './project.service';

const admin = { id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin' as const, status: 'active' as const };

test('createProject writes the project and external links in one transaction', async (context) => {
  const statements: string[] = [];
  const originalConnect = pool.connect.bind(pool);
  const originalQuery = pool.query.bind(pool);
  const client = {
    query: async (sql: string) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalizedSql);
      if (normalizedSql.startsWith('INSERT INTO projects')) return { rows: [{ id: 42 }] };
      return { rows: [] };
    },
    release: () => statements.push('RELEASE'),
  };

  pool.connect = async () => client as never;
  pool.query = (async () => ({ rows: [{ id: 42, name: 'Atlas Launch' }] })) as unknown as typeof pool.query;
  context.after(() => {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  });

  const project = await createProject(admin, {
    name: 'Atlas Launch',
    start_date: '2026-08-31',
    deadline: '2026-09-30',
    links: [
      { label: 'Repository', link_type: 'github', url: 'https://github.com/example/atlas' },
      { label: 'Design', link_type: 'figma', url: 'https://figma.com/file/atlas' },
    ],
  });

  assert.equal(project.id, 42);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.filter((sql) => sql.startsWith('INSERT INTO project_links')).length, 2);
  assert.equal(statements.at(-2), 'COMMIT');
  assert.equal(statements.at(-1), 'RELEASE');
});

test('createProject rolls back when a related link cannot be stored', async (context) => {
  const statements: string[] = [];
  const originalConnect = pool.connect.bind(pool);
  const client = {
    query: async (sql: string) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalizedSql);
      if (normalizedSql.startsWith('INSERT INTO projects')) return { rows: [{ id: 43 }] };
      if (normalizedSql.startsWith('INSERT INTO project_links')) throw new Error('Simulated link insert failure');
      return { rows: [] };
    },
    release: () => statements.push('RELEASE'),
  };

  pool.connect = async () => client as never;
  context.after(() => { pool.connect = originalConnect; });

  await assert.rejects(
    createProject(admin, {
      name: 'Rollback Project',
      links: [{ label: 'Repository', link_type: 'github', url: 'https://github.com/example/rollback' }],
    }),
    { message: 'Simulated link insert failure' },
  );
  assert.ok(statements.includes('ROLLBACK'));
  assert.equal(statements.includes('COMMIT'), false);
  assert.equal(statements.at(-1), 'RELEASE');
});

test('createProject rejects invalid dates and non-HTTPS links before writing', async () => {
  await assert.rejects(
    createProject(admin, { name: 'Invalid dates', start_date: '2026-09-30', deadline: '2026-08-31' }),
    { message: 'deadline must not be before start_date.' },
  );
  await assert.rejects(
    createProject(admin, { name: 'Invalid link', links: [{ label: 'Repo', link_type: 'github', url: 'http://example.com' }] }),
    { message: 'Link URL must be an HTTPS URL.' },
  );
});
