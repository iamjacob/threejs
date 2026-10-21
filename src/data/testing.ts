// Test entry point: exports the platform-independent data layer for node --test.
// Not imported by the app.
export { Database, DatabaseError } from "./db/database";
export { migrate } from "./db/migrate";
export { migrations } from "./db/migrations.gen";
export { createSqlJsDriver } from "./db/sqlJsDriver";
export * as schema from "./schema";
