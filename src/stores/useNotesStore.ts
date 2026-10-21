import { create } from "zustand";
import { type BootResult, bootstrapData } from "../data/bootstrap";
import type { Note, Profile } from "../data/schema";
import { offlineAccountDirectory } from "../data/usecases/accounts";
import type { DataContext } from "../data/usecases/context";
import { attachImage, readFile } from "../data/usecases/files";
import {
	createNote,
	deleteNote,
	listNotes,
	updateNote,
} from "../data/usecases/notes";
import { pendingOutbox } from "../data/usecases/outbox";
import { listProfiles, switchProfile } from "../data/usecases/profiles";
import { promoteGuest } from "../data/usecases/promoteGuest";
import { pickImage } from "../platform/capabilities";

/**
 * UI/session state for the notes slice. It holds no business rules: every action calls a use
 * case, then reloads from SQLite (the source of truth). Not used by the 3D scene or any frame loop.
 */
type NotesState = {
	status: "idle" | "booting" | "ready" | "locked" | "error";
	error?: string;
	info?: { engine: string; fileStore: string; migrationsApplied: string[] };
	profile?: Profile;
	profiles: Profile[];
	notes: Note[];
	pendingSync: number;
	busy: boolean;
	message?: string;
	boot: () => Promise<void>;
	add: (title: string, body: string) => Promise<boolean>;
	edit: (
		id: string,
		patch: { title?: string; body?: string; pinned?: boolean },
	) => Promise<void>;
	remove: (id: string) => Promise<void>;
	attach: (id: string) => Promise<void>;
	imageUrl: (fileId: string) => Promise<string | undefined>;
	promote: (displayName: string) => Promise<void>;
	lookupAccount: (email: string) => Promise<void>;
	switchTo: (profileId: string) => Promise<void>;
};

let ctx: DataContext | undefined;

export const useNotesStore = create<NotesState>()((set, get) => {
	const reload = async () => {
		const profile = get().profile;
		if (!ctx || !profile) return;
		const [notes, profiles, outbox] = await Promise.all([
			listNotes(ctx, profile.id),
			listProfiles(ctx),
			pendingOutbox(ctx, profile.id),
		]);
		set({
			notes,
			profiles,
			pendingSync: outbox.filter((e) => e.status === "pending").length,
		});
	};
	/**
	 * Runs a use case for the active profile with busy/error handling.
	 * Errors are shown to the user, never swallowed.
	 */
	const act = async (
		fn: (c: DataContext, profileId: string) => Promise<unknown>,
	) => {
		const profileId = get().profile?.id;
		if (!ctx || !profileId) return false;
		set({ busy: true, message: undefined });
		try {
			await fn(ctx, profileId);
			await reload();
			return true;
		} catch (error) {
			set({ message: error instanceof Error ? error.message : String(error) });
			return false;
		} finally {
			set({ busy: false });
		}
	};
	return {
		status: "idle",
		profiles: [],
		notes: [],
		pendingSync: 0,
		busy: false,
		async boot() {
			if (get().status !== "idle") return;
			set({ status: "booting" });
			const result: BootResult = await bootstrapData();
			if (result.status !== "ready") {
				set({
					status: result.status,
					error: result.status === "error" ? result.error : undefined,
				});
				return;
			}
			ctx = result.ctx;
			set({
				status: "ready",
				profile: result.profile,
				info: {
					engine: result.engine,
					fileStore: result.fileStore,
					migrationsApplied: result.migrationsApplied,
				},
			});
			await reload();
		},
		add: (title, body) => act((c, pid) => createNote(c, pid, { title, body })),
		edit: async (id, patch) => {
			await act((c, pid) => updateNote(c, pid, id, patch));
		},
		remove: async (id) => {
			await act((c, pid) => deleteNote(c, pid, id));
		},
		attach: async (id) => {
			const picked = await pickImage();
			if (picked.status !== "ok") {
				if (picked.status !== "cancelled")
					set({ message: `Image ${picked.status}` });
				return;
			}
			await act((c, pid) => attachImage(c, pid, id, picked.value));
		},
		imageUrl: async (fileId) => {
			const profileId = get().profile?.id;
			if (!ctx || !profileId) return undefined;
			const { record, bytes } = await readFile(ctx, profileId, fileId);
			return bytes
				? URL.createObjectURL(
						new Blob([bytes as Uint8Array<ArrayBuffer>], {
							type: record.mimeType,
						}),
					)
				: undefined;
		},
		promote: async (displayName) => {
			await act(async (c, pid) => {
				const report = await promoteGuest(c, pid, {
					kind: "new",
					displayName,
				});
				const profile = (await listProfiles(c)).find(
					(p) => p.id === report.targetProfileId,
				);
				set({
					profile,
					message: `Moved ${report.notesCopied} note(s) to ${profile?.displayName}. Guest data kept on device.`,
				});
			});
		},
		lookupAccount: async (email) => {
			const result = await offlineAccountDirectory.lookup(email);
			set({
				message:
					result.status === "unavailable"
						? `Account lookup unavailable (${result.reason}). You can keep using the app as a guest, or create a local account.`
						: result.status,
			});
		},
		switchTo: async (profileId) => {
			await act(async (c) =>
				set({ profile: await switchProfile(c, profileId) }),
			);
		},
	};
});
