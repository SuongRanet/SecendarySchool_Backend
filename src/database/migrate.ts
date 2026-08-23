import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pool, closePool } from './connection';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const UP_MARKER = '-- +migrate Up';
const DOWN_MARKER = '-- +migrate Down';

interface MigrationFile {
  name: string;
  filePath: string;
  up: string;
  down: string;
  checksum: string;
}

interface AppliedMigration {
  name: string;
  checksum: string;
  applied_at: Date;
}

const ensureMigrationsTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          BIGSERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL UNIQUE,
      checksum    VARCHAR(64)  NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
};

const splitSections = (contents: string, name: string): { up: string; down: string } => {
  const upIndex = contents.indexOf(UP_MARKER);
  const downIndex = contents.indexOf(DOWN_MARKER);

  if (upIndex === -1) {
    throw new Error(`Migration "${name}" is missing the "${UP_MARKER}" marker`);
  }

  if (downIndex === -1) {
    throw new Error(`Migration "${name}" is missing the "${DOWN_MARKER}" marker`);
  }

  if (downIndex < upIndex) {
    throw new Error(`Migration "${name}" declares its Down section before its Up section`);
  }

  return {
    up: contents.slice(upIndex + UP_MARKER.length, downIndex).trim(),
    down: contents.slice(downIndex + DOWN_MARKER.length).trim(),
  };
};

const loadMigrations = (): MigrationFile[] => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const contents = fs.readFileSync(filePath, 'utf8');
      const { up, down } = splitSections(contents, file);

      return {
        name: file,
        filePath,
        up,
        down,
        checksum: createHash('sha256').update(contents).digest('hex'),
      };
    });
};

const getAppliedMigrations = async (): Promise<AppliedMigration[]> => {
  const result = await pool.query<AppliedMigration>(
    'SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name ASC',
  );
  return result.rows;
};

const runUp = async (): Promise<void> => {
  await ensureMigrationsTable();

  const migrations = loadMigrations();
  const applied = await getAppliedMigrations();
  const appliedByName = new Map(applied.map((row) => [row.name, row]));

  for (const migration of migrations) {
    const previous = appliedByName.get(migration.name);

    if (previous) {
      if (previous.checksum !== migration.checksum) {
        throw new Error(
          `Migration "${migration.name}" was modified after it was applied. ` +
            'Create a new migration instead of editing an applied one.',
        );
      }
      continue;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(migration.up);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        migration.name,
        migration.checksum,
      ]);
      await client.query('COMMIT');
      logger.info(`Applied migration ${migration.name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(
        `Migration "${migration.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.release();
    }
  }

  const pending = migrations.length - appliedByName.size;
  logger.info(pending > 0 ? `${pending} migration(s) applied` : 'Database is already up to date');
};

const runDown = async (): Promise<void> => {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const last = applied[applied.length - 1];

  if (!last) {
    logger.info('No migration to roll back');
    return;
  }

  const migration = loadMigrations().find((item) => item.name === last.name);

  if (!migration) {
    throw new Error(`Migration file for "${last.name}" no longer exists; cannot roll back`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(migration.down);
    await client.query('DELETE FROM schema_migrations WHERE name = $1', [migration.name]);
    await client.query('COMMIT');
    logger.info(`Rolled back migration ${migration.name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(
      `Rollback of "${migration.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    client.release();
  }
};

const showStatus = async (): Promise<void> => {
  await ensureMigrationsTable();

  const migrations = loadMigrations();
  const applied = new Map((await getAppliedMigrations()).map((row) => [row.name, row]));

  logger.info(`Migration status (${migrations.length} file(s))`);

  for (const migration of migrations) {
    const record = applied.get(migration.name);
    const state = record
      ? `applied  ${record.applied_at.toISOString()}`
      : 'pending';
    process.stdout.write(`  ${state.padEnd(36)} ${migration.name}\n`);
  }
};

const main = async (): Promise<void> => {
  const command = process.argv[2] ?? 'up';

  switch (command) {
    case 'up':
      await runUp();
      break;
    case 'down':
      await runDown();
      break;
    case 'status':
      await showStatus();
      break;
    default:
      throw new Error(`Unknown migration command "${command}". Use up, down or status.`);
  }
};

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Migration command failed', error);
    await closePool();
    process.exit(1);
  });
