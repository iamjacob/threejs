import { create } from "zustand";
import { bootstrapData } from "../data/bootstrap";
import type { LibraryBook } from "../data/schema";
import {
	type DigitalFileInput,
	importDigitalFile,
} from "../data/usecases/bookFiles";
import {
	addPageScan,
	type PageInput,
	removeAsset,
} from "../data/usecases/bookIntake";
import {
	type BookOverview,
	getBookOverview,
	listMyBooks,
	readAssetBytes,
} from "../data/usecases/bookManager";
import {
	addManualBook,
	type MetadataPatch,
	updateBookMetadata,
} from "../data/usecases/bookMetadata";
import { movePage, setPageNumber } from "../data/usecases/bookPages";
import type { DataContext } from "../data/usecases/context";
import { importLegacyScans } from "../data/usecases/legacyScanImport";
import { resolveActiveProfile } from "../data/usecases/profiles";
import {
	type CleanupPlan,
	type CleanupResult,
	planStorageCleanup,
	runStorageCleanup,
} from "../data/usecases/storageCleanup";
import { createLegacyScanSource } from "../platform/legacyScanSource";
import { currentGeneration, onProfileSession } from "./profileSession";

/**
 * UI state for /library and /book/:id/manage. No business rules: every action calls a use case
 * with the active profile id, then reloads from SQLite. A profile switch clears everything first
 * (nothing of the previous person renders), and results that finish after a switch are dropped.
 */
type State = {
	status: "idle" | "booting" | "ready" | "locked" | "error";
	error?: string;
	profileId?: string;
	books: LibraryBook[];
	booksLoaded: boolean;
	overview?: BookOverview;
	overviewFor?: string;
	missing?: string;
	busy: boolean;
	message?: string;
	boot: () => Promise<void>;
	loadBooks: () => Promise<void>;
	open: (bookId: string) => Promise<void>;
	addBook: (title: string, author: string) => Promise<LibraryBook | undefined>;
	saveMetadata: (patch: MetadataPatch) => Promise<boolean>;
	addPage: (input: PageInput) => Promise<boolean>;
	importFile: (input: DigitalFileInput) => Promise<boolean>;
	renumberPage: (
		assetId: string,
		pageNumber: number,
		swap?: boolean,
	) => Promise<boolean>;
	movePage: (assetId: string, direction: -1 | 1) => Promise<boolean>;
	remove: (assetId: string) => Promise<void>;
	previewUrl: (fileId: string) => Promise<string | undefined>;
	/** Read-only plan for the active profile; nothing is deleted until confirmCleanup. */
	cleanupPlan?: CleanupPlan;
	cleanupResult?: CleanupResult;
	planCleanup: () => Promise<void>;
	confirmCleanup: () => Promise<void>;
	cancelCleanup: () => void;
};

let ctx: DataContext | undefined;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const personal = () => ({
	profileId: undefined,
	books: [],
	booksLoaded: false,
	overview: undefined,
	overviewFor: undefined,
	missing: undefined,
	message: undefined,
	cleanupPlan: undefined,
	cleanupResult: undefined,
});

export const useBookManagerStore = create<State>()((set, get) => {
	/** Runs `fn` for the current profile, ignoring the result if the profile changed meanwhile. */
	const guarded = async <T>(
		fn: (c: DataContext, pid: string) => Promise<T>,
	) => {
		const pid = get().profileId;
		if (!ctx || !pid) return undefined;
		const gen = currentGeneration();
		const result = await fn(ctx, pid);
		if (gen !== currentGeneration() || get().profileId !== pid)
			return undefined;
		return { result };
	};
	return {
		status: "idle",
		...personal(),
		busy: false,
		async boot() {
			if (get().status !== "idle") return;
			set({ status: "booting" });
			const boot = await bootstrapData();
			if (boot.status !== "ready") {
				set({
					status: boot.status,
					error: boot.status === "error" ? boot.error : undefined,
				});
				return;
			}
			ctx = boot.ctx;
			const profile = await resolveActiveProfile(ctx);
			// Same guest-only, verified, idempotent import /maps runs: new scanner books appear here too.
			const legacy = createLegacyScanSource();
			if (legacy)
				await importLegacyScans(ctx, profile.id, legacy).catch(() => {});
			set({ status: "ready", profileId: profile.id });
		},
		async loadBooks() {
			const r = await guarded((c, pid) => listMyBooks(c, pid));
			if (r) set({ books: r.result, booksLoaded: true });
		},
		async open(bookId) {
			if (get().overviewFor !== bookId)
				set({ overview: undefined, overviewFor: bookId, missing: undefined });
			try {
				const r = await guarded((c, pid) => getBookOverview(c, pid, bookId));
				if (r && get().overviewFor === bookId)
					set({ overview: r.result, missing: undefined });
			} catch (error) {
				if ((error as Error).name === "NotFoundError")
					set({ overview: undefined, missing: bookId });
				else set({ message: errorText(error) });
			}
		},
		async addBook(title, author) {
			set({ busy: true, message: undefined });
			try {
				const r = await guarded((c, pid) =>
					addManualBook(c, pid, { title, author }),
				);
				await get().loadBooks();
				return r?.result;
			} catch (error) {
				set({ message: errorText(error) });
				return undefined;
			} finally {
				set({ busy: false });
			}
		},
		saveMetadata: (patch) =>
			act(get, set, (c, pid, id) => updateBookMetadata(c, pid, id, patch)),
		addPage: (input) =>
			act(get, set, (c, pid, id) => addPageScan(c, pid, id, input)),
		importFile: (input) =>
			act(get, set, (c, pid, id) => importDigitalFile(c, pid, id, input)),
		renumberPage: (assetId, pageNumber, swap) =>
			act(get, set, (c, pid) =>
				setPageNumber(c, pid, assetId, pageNumber, { swap }),
			),
		movePage: (assetId, direction) =>
			act(get, set, (c, pid) => movePage(c, pid, assetId, direction)),
		remove: async (assetId) => {
			await act(get, set, (c, pid) => removeAsset(c, pid, assetId));
		},
		async planCleanup() {
			set({ cleanupResult: undefined, cleanupPlan: undefined });
			try {
				const r = await guarded((c, pid) => planStorageCleanup(c, pid));
				if (r) set({ cleanupPlan: r.result });
			} catch (error) {
				set({ message: `Could not check storage: ${errorText(error)}` });
			}
		},
		async confirmCleanup() {
			const plan = get().cleanupPlan;
			if (!plan) return;
			set({ busy: true });
			try {
				const r = await guarded((c, pid) => runStorageCleanup(c, pid, plan));
				if (r) set({ cleanupResult: r.result, cleanupPlan: undefined });
			} catch (error) {
				set({
					message: `Nothing was deleted: ${errorText(error)}`,
					cleanupPlan: undefined,
				});
			} finally {
				set({ busy: false });
				const bookId = get().overviewFor;
				if (bookId) await get().open(bookId);
			}
		},
		cancelCleanup: () => set({ cleanupPlan: undefined }),
		async previewUrl(fileId) {
			const r = await guarded((c, pid) => readAssetBytes(c, pid, fileId)).catch(
				() => undefined,
			);
			const file = r?.result;
			if (!file?.bytes) return undefined;
			return URL.createObjectURL(
				new Blob([file.bytes as Uint8Array<ArrayBuffer>], {
					type: file.mimeType,
				}),
			);
		},
	};
});

/** Mutation on the open book: busy flag, honest error message, then reload from SQLite. */
async function act(
	get: () => State,
	set: (s: Partial<State>) => void,
	fn: (c: DataContext, pid: string, bookId: string) => Promise<unknown>,
): Promise<boolean> {
	const pid = get().profileId;
	const bookId = get().overviewFor;
	if (!ctx || !pid || !bookId) return false;
	set({ busy: true, message: undefined });
	try {
		await fn(ctx, pid, bookId);
		return true;
	} catch (error) {
		if (get().profileId === pid) set({ message: errorText(error) });
		return false;
	} finally {
		set({ busy: false });
		if (get().profileId === pid) await get().open(bookId);
	}
}

declare global {
	interface Window {
		/** Test hook (VITE_BOOOKS_TEST_HOOKS=1 builds only): same use case as "Add a page image", picker skipped. */
		__boooksBookManagerTest?: {
			addPage(bytes: number[], mimeType: string): Promise<boolean>;
			/** Same use case as "Import EPUB or PDF" (picker skipped; for the Android WebView test). */
			importFile(bytes: number[], name: string): Promise<boolean>;
		};
	}
}
if (
	import.meta.env.VITE_BOOOKS_TEST_HOOKS === "1" &&
	typeof window !== "undefined"
)
	window.__boooksBookManagerTest = {
		addPage: (bytes, mimeType) =>
			useBookManagerStore.getState().addPage({
				bytes: Uint8Array.from(bytes),
				mimeType,
				provenance: "device_file",
			}),
		importFile: (bytes, name) =>
			useBookManagerStore.getState().importFile({
				bytes: Uint8Array.from(bytes),
				originalName: name,
				rightsBasis: "public_domain",
				sourceNote: "Test fixture",
			}),
	};

onProfileSession((event) => {
	if (event.phase === "clear") {
		useBookManagerStore.setState(personal());
		return;
	}
	if (useBookManagerStore.getState().status !== "ready") return;
	useBookManagerStore.setState({ profileId: event.profile.id });
});
