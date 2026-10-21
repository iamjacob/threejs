// Test entry point: exports the platform-independent data layer for node --test.
// Not imported by the app.
export { Database, DatabaseError } from "./db/database";
export { migrate } from "./db/migrate";
export { migrations } from "./db/migrations.gen";
export { createSqlJsDriver } from "./db/sqlJsDriver";
export * as schema from "./schema";
export { createMemoryFileStore } from "../platform/files/fileStore";
export * from "./usecases/accounts";
export * from "./usecases/context";
export * from "./usecases/files";
export * from "./usecases/notes";
export * from "./usecases/outbox";
export * from "./usecases/profiles";
export * from "./usecases/promoteGuest";
export { settingsRepository } from "./repositories/settings";
export { noteRepository } from "./repositories/notes";
export { sha256Hex } from "./ids";
import { sql } from "drizzle-orm";
/** Raw SQL for test setup only (e.g. simulating a signed-out device). */
export const sqlRaw = (statement: string) => sql.raw(statement);
