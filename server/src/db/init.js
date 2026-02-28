/**
 * Database Initialization
 * ----------------------
 * Creates the database if it doesn't exist.
 * 
 * Usage: npm run db:init
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Connect without database to create it
const adminConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: 'postgres', // Connect to default postgres db
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

const targetDb = process.env.DB_NAME || 'unix_trainer';

async function initDatabase() {
  const client = new Client(adminConfig);
  
  try {
    await client.connect();
    console.log('[Init] Connected to PostgreSQL');
    
    // Check if database exists
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb]
    );
    
    if (result.rows.length === 0) {
      // Create database (must be in transaction to avoid errors)
      await client.query(`CREATE DATABASE ${targetDb}`);
      console.log(`[Init] Database "${targetDb}" created successfully`);
    } else {
      console.log(`[Init] Database "${targetDb}" already exists`);
    }
  } catch (error) {
    console.error('[Init] Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDatabase();
