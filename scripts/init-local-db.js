const { Client } = require('pg');

async function setup() {
  const client = new Client({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'postgres',
    port: 5432,
  });

  await client.connect();
  console.log('Connected to PostgreSQL root database.');

  try {
    await client.query("ALTER USER postgres WITH PASSWORD 'postgres';");
    console.log('Postgres user password set to postgres.');
  } catch (e) {
    console.log('Password alter info:', e.message);
  }

  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'apnahealth'");
  if (res.rows.length === 0) {
    await client.query('CREATE DATABASE apnahealth;');
    console.log('Created database: apnahealth');
  } else {
    console.log('Database apnahealth already exists.');
  }

  await client.end();
  console.log('Database initialization complete.');
}

setup().catch(console.error);
