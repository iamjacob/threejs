import type { FileStore } from "../../platform/files/fileStore";
import type { Database } from "../db/database";
import type { Clock, IdFactory } from "../ids";

/** Everything a use case needs. Built once in bootstrap; replaced with fakes in tests. */
export type DataContext = {
	database: Database;
	files: FileStore;
	clock: Clock;
	newId: IdFactory;
};

export class ValidationError extends Error {
	constructor(
		message: string,
		readonly field: string,
	) {
		super(message);
		this.name = "ValidationError";
	}
}

export class NotFoundError extends Error {
	constructor(what: string) {
		super(`${what} not found`);
		this.name = "NotFoundError";
	}
}
