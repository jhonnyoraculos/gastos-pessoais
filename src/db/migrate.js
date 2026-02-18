const fs = require('fs/promises');
const path = require('path');
const pool = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, '../../db/migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS gp_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT now()
    )
  `);
}

async function getMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const appliedRes = await client.query('SELECT filename FROM gp_migrations');
    const applied = new Set(appliedRes.rows.map((row) => row.filename));
    const files = await getMigrationFiles();
    const pending = files.filter((filename) => !applied.has(filename));

    if (pending.length === 0) {
      console.log('Nenhuma migration pendente.');
      return;
    }

    for (const filename of pending) {
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql = await fs.readFile(filepath, 'utf8');

      console.log(`Aplicando migration: ${filename}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO gp_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`Migration aplicada com sucesso: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha ao aplicar ${filename}: ${error.message}`);
      }
    }
  } finally {
    client.release();
  }
}

runMigrations()
  .then(async () => {
    console.log('Processo de migrations finalizado.');
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error.message);
    await pool.end();
    process.exit(1);
  });
