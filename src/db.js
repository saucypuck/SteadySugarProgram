// Tiny document store. Uses Postgres (one JSONB table) when DATABASE_URL is set,
// otherwise an in-memory store so the app runs anywhere with zero setup.
// Swap for a real ORM/schema once the data model settles.
const { randomUUID } = require('crypto');

const mem = new Map();
let pool = null;

async function init() {
  if (!process.env.DATABASE_URL) {
    console.warn('[db] DATABASE_URL not set — using in-memory store (data resets on restart).');
    return;
  }
  try {
    const { Pool } = require('pg');
    const url = process.env.DATABASE_URL;
    const ssl = /sslmode=require|\.render\.com/.test(url) ? { rejectUnauthorized: false } : undefined;
    pool = new Pool({ connectionString: url, ssl });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS docs (
        collection text NOT NULL,
        id text NOT NULL,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      )`);
    console.log('[db] Connected to Postgres.');
  } catch (err) {
    console.error('[db] Postgres unavailable, falling back to in-memory store:', err.message);
    pool = null;
  }
}

const bucket = (name) => {
  if (!mem.has(name)) mem.set(name, new Map());
  return mem.get(name);
};

async function insert(collection, data) {
  const doc = { id: randomUUID(), createdAt: new Date().toISOString(), ...data };
  if (pool) await pool.query('INSERT INTO docs (collection, id, data) VALUES ($1, $2, $3)', [collection, doc.id, doc]);
  else bucket(collection).set(doc.id, doc);
  return doc;
}

// Bulk insert (used for seeding / future ad-platform imports).
async function insertMany(collection, rows) {
  const docs = rows.map((data) => ({ id: randomUUID(), createdAt: new Date().toISOString(), ...data }));
  if (pool) {
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500);
      const params = [];
      const values = chunk.map((d, j) => {
        params.push(collection, d.id, d, d.createdAt);
        return `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`;
      });
      await pool.query(`INSERT INTO docs (collection, id, data, created_at) VALUES ${values.join(', ')}`, params);
    }
  } else {
    for (const d of docs) bucket(collection).set(d.id, d);
  }
  return docs;
}

async function get(collection, id) {
  if (!id) return null;
  if (pool) {
    const r = await pool.query('SELECT data FROM docs WHERE collection = $1 AND id = $2', [collection, id]);
    return r.rows[0] ? r.rows[0].data : null;
  }
  return bucket(collection).get(id) || null;
}

// Newest first.
async function all(collection) {
  if (pool) {
    const r = await pool.query('SELECT data FROM docs WHERE collection = $1 ORDER BY created_at DESC', [collection]);
    return r.rows.map((row) => row.data);
  }
  return [...bucket(collection).values()].reverse();
}

async function findBy(collection, field, value) {
  if (pool) {
    const r = await pool.query(
      'SELECT data FROM docs WHERE collection = $1 AND data->>$2 = $3 ORDER BY created_at DESC',
      [collection, field, String(value)]
    );
    return r.rows.map((row) => row.data);
  }
  return (await all(collection)).filter((d) => String(d[field]) === String(value));
}

async function findOneBy(collection, field, value) {
  return (await findBy(collection, field, value))[0] || null;
}

async function update(collection, id, patch) {
  const doc = await get(collection, id);
  if (!doc) return null;
  const next = { ...doc, ...patch, updatedAt: new Date().toISOString() };
  if (pool) await pool.query('UPDATE docs SET data = $3 WHERE collection = $1 AND id = $2', [collection, id, next]);
  else bucket(collection).set(id, next);
  return next;
}

module.exports = { init, insert, insertMany, get, all, findBy, findOneBy, update };
