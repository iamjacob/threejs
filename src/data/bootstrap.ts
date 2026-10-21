import { platform } from "../platform/capabilities";
import type { FileStore } from "../platform/files/fileStore";
import { openCapacitorDriver } from "./db/capacitorDriver";
import { Database } from "./db/database";
import { migrate } from "./db/migrate";
import { randomId, systemClock } from "./ids";
import type { Profile } from "./schema";
import type { DataContext } from "./usecases/context";
import { ensureActiveProfile } from "./usecases/profiles";

/** One SQLite database per install/device. Profiles are rows, not separate databases. */
export const DATABASE_NAME = "boooks";

export type BootResult =
	| {
			status: "ready";
			ctx: DataContext;
			profile: Profile;
			engine: string;
			fileStore: string;
			migrationsApplied: string[];
	  }
	| { status: "locked" }
	| { status: "error"; error: string };

let booting: Promise<BootResult> | undefined;

/** Opens the data layer once per page. Safe to call repeatedly (returns the same promise). */
export function bootstrapData(): Promise<BootResult> {
	booting ??= boot().catch((error) => ({
		status: "error" as const,
		error: error instanceof Error ? error.message : String(error),
	}));
	return booting;
}

async function boot(): Promise<BootResult> {
	if (!platform.isNative && !(await acquireTabLock()))
		return { status: "locked" };
	const driver = await openCapacitorDriver(DATABASE_NAME);
	const database = new Database(driver);
	const { applied } = await migrate(database);
	const files = await createFileStore();
	const ctx: DataContext = {
		database,
		files,
		clock: systemClock,
		newId: randomId,
	};
	const profile = await ensureActiveProfile(ctx);
	flushWhenHidden(database);
	if (!platform.isNative) {
		const { requestPersistence } = await import(
			"../platform/files/webFileStore"
		);
		void requestPersistence().catch(() => {});
	}
	return {
		status: "ready",
		ctx,
		profile,
		engine: database.engine,
		fileStore: files.name,
		migrationsApplied: applied,
	};
}

async function createFileStore(): Promise<FileStore> {
	if (platform.isNative) {
		const { createNativeFileStore } = await import(
			"../platform/files/nativeFileStore"
		);
		return createNativeFileStore();
	}
	const { createWebFileStore } = await import("../platform/files/webFileStore");
	return createWebFileStore();
}

/**
 * jeep-sqlite keeps the database in memory per tab, and the last saveToStore wins, so two tabs
 * would overwrite each other. Only the tab holding this lock opens the database. The lock is
 * released automatically when the tab closes. Without Web Locks, we proceed (documented risk).
 */
function acquireTabLock(): Promise<boolean> {
	if (!navigator.locks) return Promise.resolve(true);
	return new Promise((resolve) => {
		navigator.locks
			.request(`${DATABASE_NAME}-sqlite`, { ifAvailable: true }, (lock) => {
				if (!lock) {
					resolve(false);
					return;
				}
				resolve(true);
				return new Promise<void>(() => {}); // hold for the page lifetime
			})
			.catch(() => resolve(true));
	});
}

/** Writes already flush after commit; this is a belt-and-braces flush on background/close. */
function flushWhenHidden(database: Database) {
	if (typeof document === "undefined") return;
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden")
			void database.flushNow().catch(() => {});
	});
}
