const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL nao definida. Configure a variavel de ambiente para conectar no Postgres.');
}

const shouldUseSSL =
  process.env.PGSSLMODE === 'require' ||
  (connectionString &&
    !connectionString.includes('localhost') &&
    !connectionString.includes('127.0.0.1'));

const pool = new Pool({
  connectionString,
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do Postgres:', err);
});

module.exports = pool;
