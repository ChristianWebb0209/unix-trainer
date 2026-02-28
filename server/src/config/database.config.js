/**
 * Database Configuration
 * ---------------------
 * PostgreSQL connection settings (supports local and Supabase).
 * 
 * Environment variables (from .env file):
 * - DB_CONNECTION_STRING: Full PostgreSQL connection string (recommended for Supabase)
 * - DB_HOST: Database host (default: localhost)
 * - DB_PORT: Database port (default: 5432)
 * - DB_NAME: Database name (default: postgres)
 * - DB_USER: Database user (default: postgres)
 * - DB_PASSWORD: Database password
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Build config from connection string or individual settings
let dbConfig;

if (process.env.DB_CONNECTION_STRING) {
  dbConfig = {
    connectionString: process.env.DB_CONNECTION_STRING,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
} else {
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

// Create connection pool
export const pool = new Pool(dbConfig);

// Test connection on startup
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('[Database] Connected to PostgreSQL successfully');
    client.release();
    return true;
  } catch (error) {
    console.error('[Database] Failed to connect:', error.message);
    return false;
  }
}

// Helper for parameterized queries
export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

// Helper for transactions
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default { pool, query, transaction, testConnection, dbConfig };
