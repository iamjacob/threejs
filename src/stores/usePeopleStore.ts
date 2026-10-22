import { create } from "zustand";
import { bootstrapData } from "../data/bootstrap";
import type { Message, Profile } from "../data/schema";
import type { DataContext } from "../data/usecases/context";
import {
	type ConversationSummary,
	listConversations,
	listMessages,
	openLocalConversation,
	sendLocalMessage,
} from "../data/usecases/localMessages";
import {
	createLocalProfile,
	type DeviceDirectoryEntry,
	getDeviceVisibility,
	hideFromDevice,
	listDeviceDirectory,
	setDeviceVisibility,
} from "../data/usecases/localProfiles";
import { listProfiles, resolveActiveProfile } from "../data/usecases/profiles";
import {
	currentGeneration,
	onProfileSession,
	switchActiveProfile,
} from "./profileSession";

/**
 * UI/session state for /people (several people on one device, offline). No business rules here:
 * every action calls a use case with the explicit active profile id, then reloads from SQLite.
 * All per-person state (directory, conversations, open thread, draft) is cleared on switch.
 */
type SendState = "idle" | "saving" | "saved" | "error";

type PeopleState = {
	status: "idle" | "booting" | "ready" | "locked" | "error";
	error?: string;
	/** undefined while switching: the page shows a loading state, never the previous person. */
	profile?: Profile;
	profiles: Profile[];
	visibility?: { visible: false } | { visible: true; publicName: string };
	directory: DeviceDirectoryEntry[];
	conversations: ConversationSummary[];
	openId?: string;
	messages: Message[];
	draft: string;
	/** Key for the message being composed; reused on retry so it is stored once. */
	draftKey: string;
	sendState: SendState;
	message?: string;
	busy: boolean;
	boot: () => Promise<void>;
	load: (profile: Profile) => Promise<void>;
	addPerson: (displayName: string) => Promise<boolean>;
	switchTo: (profileId: string) => Promise<void>;
	setVisible: (publicName: string) => Promise<void>;
	hide: () => Promise<void>;
	openWith: (otherProfileId: string) => Promise<void>;
	openConversation: (id: string) => Promise<void>;
	closeConversation: () => void;
	setDraft: (draft: string) => void;
	send: () => Promise<void>;
};

const newKey = () => crypto.randomUUID();
const personal = () => ({
	profile: undefined,
	visibility: undefined,
	directory: [],
	conversations: [],
	openId: undefined,
	messages: [],
	draft: "",
	draftKey: newKey(),
	sendState: "idle" as SendState,
	message: undefined,
});
const thread = () => ({
	messages: [],
	draft: "",
	draftKey: newKey(),
	sendState: "idle" as SendState,
});

let ctx: DataContext | undefined;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const usePeopleStore = create<PeopleState>()((set, get) => {
	const act = async (fn: (c: DataContext, pid: string) => Promise<unknown>) => {
		const profile = get().profile;
		if (!ctx || !profile) return false;
		set({ busy: true, message: undefined });
		try {
			await fn(ctx, profile.id);
			await get().load(profile);
			return true;
		} catch (error) {
			set({ message: errorText(error) });
			return false;
		} finally {
			set({ busy: false });
		}
	};

	return {
		status: "idle",
		profiles: [],
		...personal(),
		busy: false,
		async boot() {
			if (get().status !== "idle") return;
			set({ status: "booting" });
			const result = await bootstrapData();
			if (result.status !== "ready") {
				const error = result.status === "error" ? result.error : undefined;
				set({ status: result.status, error });
				return;
			}
			ctx = result.ctx;
			const profile = await resolveActiveProfile(ctx);
			set({ status: "ready", profile });
			await get().load(profile);
		},
		/** Loads everything for `profile`; drops the result if a switch happened meanwhile. */
		async load(profile) {
			if (!ctx) return;
			const gen = currentGeneration();
			const openId = get().openId;
			const [profiles, visibility, directory, conversations, messages] =
				await Promise.all([
					listProfiles(ctx),
					getDeviceVisibility(ctx, profile.id),
					listDeviceDirectory(ctx, profile.id),
					listConversations(ctx, profile.id),
					openId ? listMessages(ctx, profile.id, openId) : [],
				]);
			if (gen !== currentGeneration() || get().profile?.id !== profile.id)
				return;
			set({ profiles, visibility, directory, conversations, messages });
		},
		addPerson: (displayName) =>
			act(async (c) => {
				const person = await createLocalProfile(c, { displayName });
				set({ message: `Added ${person.displayName} on this device.` });
			}),
		switchTo: async (profileId) => {
			if (!ctx) return;
			await switchActiveProfile(ctx, profileId).catch((error) =>
				set({ message: errorText(error) }),
			);
		},
		setVisible: async (publicName) => {
			await act((c, pid) => setDeviceVisibility(c, pid, { publicName }));
		},
		hide: async () => {
			await act((c, pid) => hideFromDevice(c, pid));
		},
		openWith: async (otherProfileId) => {
			await act(async (c, pid) => {
				const { id } = await openLocalConversation(c, pid, otherProfileId);
				set({ openId: id, ...thread() });
			});
		},
		openConversation: async (id) => {
			set({ openId: id, ...thread() });
			await act(async () => {});
		},
		closeConversation: () => set({ openId: undefined, ...thread() }),
		setDraft: (draft) => set({ draft, sendState: "idle" }),
		send: async () => {
			const { openId, draft, draftKey } = get();
			if (!openId || !draft.trim()) return;
			set({ sendState: "saving" });
			const ok = await act((c, pid) =>
				sendLocalMessage(c, pid, openId, { body: draft, clientKey: draftKey }),
			);
			// "Saved" only after the durable write resolved (Database.write flushes first).
			if (ok) set({ draft: "", draftKey: newKey(), sendState: "saved" });
			else set({ sendState: "error" });
		},
	};
});

onProfileSession((event) => {
	if (event.phase === "clear") {
		usePeopleStore.setState(personal());
		return;
	}
	const store = usePeopleStore.getState();
	if (store.status !== "ready") return;
	usePeopleStore.setState({ profile: event.profile });
	void store
		.load(event.profile)
		.catch((e) => usePeopleStore.setState({ message: errorText(e) }));
});
