import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from the schema; they are applied at startup by createDatabase.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/drizzle/schema/*.ts',
  out: './drizzle',
});
