import { defineConfig } from 'drizzle-kit';

const url =
  process.env.TURSO_DATABASE_URL ||
  (process.env.DATABASE_PATH ? `file:${process.env.DATABASE_PATH}` : 'file:./data/app.db');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'turso',
  dbCredentials: {
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
