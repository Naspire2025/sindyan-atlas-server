import { pool } from './connection';

const CURRENT_SCHEMA_VERSION = 2;

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function ensureColumn(tableName: string, definition: string): Promise<void> {
  const columnName = definition.trim().split(/\s+/)[0];
  if (!(await columnExists(tableName, columnName))) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

async function createSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email_normalized TEXT NOT NULL UNIQUE,
      email_display TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'team_member')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner TEXT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'active', 'on_hold', 'blocked', 'completed', 'cancelled')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      start_date TEXT,
      deadline TEXT,
      website_url TEXT,
      drive_folder_url TEXT,
      budget_allocated_amount REAL,
      budget_currency TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      role TEXT
    );

    CREATE TABLE IF NOT EXISTS project_phases (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      phase_id INTEGER REFERENCES project_phases(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'done', 'missed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
      assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'blocked', 'reviewing', 'reviewed', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      due_date TEXT,
      estimated_hours REAL CHECK (estimated_hours >= 0),
      blocker_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author TEXT,
      author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      absolute_expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id SERIAL PRIMARY KEY,
      email_normalized TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'team_member')),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invitation_project_memberships (
      invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      project_role TEXT NOT NULL DEFAULT 'member' CHECK (project_role IN ('member', 'project_lead')),
      PRIMARY KEY (invitation_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS project_memberships (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_role TEXT NOT NULL DEFAULT 'member' CHECK (project_role IN ('member', 'project_lead')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS project_links (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      link_type TEXT NOT NULL,
      url TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_activity (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_budget_lines (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      planned_amount REAL NOT NULL CHECK (planned_amount >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      effective_date TEXT NOT NULL,
      note TEXT,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS spend_records (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      spent_on TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      category TEXT NOT NULL,
      note TEXT,
      recorded_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS member_capacity_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      effective_from TEXT NOT NULL,
      weekly_capacity_hours REAL NOT NULL CHECK (weekly_capacity_hours >= 0),
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, effective_from)
    );

    CREATE TABLE IF NOT EXISTS member_availability (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      capacity_hours REAL NOT NULL CHECK (capacity_hours >= 0),
      availability_status TEXT NOT NULL CHECK (availability_status IN ('available', 'unavailable', 'reduced_capacity')),
      note TEXT,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (ends_on >= starts_on)
    );

    CREATE TABLE IF NOT EXISTS project_member_allocations (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      allocation_percent REAL NOT NULL CHECK (allocation_percent BETWEEN 0 AND 100),
      planned_hours REAL CHECK (planned_hours >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (ends_on >= starts_on)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      capacity_description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS asset_allocations (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      allocation_percent REAL NOT NULL CHECK (allocation_percent BETWEEN 0 AND 100),
      note TEXT,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (ends_on >= starts_on)
    );

    CREATE TABLE IF NOT EXISTS risks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      probability TEXT NOT NULL CHECK (probability IN ('low', 'medium', 'high')),
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigating', 'escalated', 'resolved')),
      mitigation_progress INTEGER NOT NULL DEFAULT 0 CHECK (mitigation_progress BETWEEN 0 AND 100),
      mitigation_note TEXT,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS issues (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_resolution_date TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigating', 'escalated', 'resolved')),
      resolution_progress INTEGER NOT NULL DEFAULT 0 CHECK (resolution_progress BETWEEN 0 AND 100),
      resolution_note TEXT,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vault_entries (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('external_link', 'markdown_note', 'credential', 'secret_key', 'file')),
      title TEXT NOT NULL,
      category TEXT,
      markdown_content TEXT,
      external_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS vault_tags (
      id SERIAL PRIMARY KEY,
      name_normalized TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_entry_tags (
      vault_entry_id INTEGER NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
      vault_tag_id INTEGER NOT NULL REFERENCES vault_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (vault_entry_id, vault_tag_id)
    );

    CREATE TABLE IF NOT EXISTS vault_secrets (
      vault_entry_id INTEGER PRIMARY KEY REFERENCES vault_entries(id) ON DELETE CASCADE,
      encrypted_value BYTEA NOT NULL,
      key_version TEXT NOT NULL,
      nonce BYTEA NOT NULL,
      auth_tag BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vault_files (
      id SERIAL PRIMARY KEY,
      vault_entry_id INTEGER NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      checksum_sha256 TEXT,
      storage_status TEXT NOT NULL CHECK (storage_status IN ('pending', 'quarantined', 'available', 'rejected', 'deleted')),
      uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      available_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS vault_audit_log (
      id SERIAL PRIMARY KEY,
      vault_entry_id INTEGER NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
      vault_file_id INTEGER REFERENCES vault_files(id) ON DELETE SET NULL,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      request_id TEXT,
      metadata_json TEXT
    );
  `);
}

async function createIndexes(): Promise<void> {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_memberships_user_project ON project_memberships(user_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_task_activity_task_created ON task_activity(task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_vault_entries_project ON vault_entries(project_id);
    CREATE INDEX IF NOT EXISTS idx_vault_files_entry_status ON vault_files(vault_entry_id, storage_status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_project ON tasks(assignee_user_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_due ON tasks(project_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_due ON tasks(assignee_user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_milestone_status ON tasks(milestone_id, status);
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
    CREATE INDEX IF NOT EXISTS idx_team_project ON team_members(project_id);
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);
  `);
}

const SEQUENTIAL_MIGRATIONS: Record<number, () => Promise<void>> = {
  2: async () => {
    await pool.query('ALTER TABLE sessions DROP COLUMN IF EXISTS csrf_token_hash');
  },
};

async function applyVersion(version: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
    if (rows.length === 0) {
      if (version === 1) {
        await createSchema();
        await createIndexes();
      }
      const apply = SEQUENTIAL_MIGRATIONS[version];
      if (apply) await apply();
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (let version = 1; version <= CURRENT_SCHEMA_VERSION; version += 1) {
    await applyVersion(version);
  }
}
