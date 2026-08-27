import { Pool } from 'pg';

const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST ?? '127.0.0.1',
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? 'atlas',
      user: process.env.PGUSER ?? process.env.USER ?? 'mac',
      password: process.env.PGPASSWORD ?? undefined,
    };

export const pool = new Pool({
  ...connectionConfig,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});
