import { type FormEvent, useState } from "react";
import { usePeopleStore } from "../../stores/usePeopleStore";

const button = "rounded bg-sky-600 px-3 py-1 font-medium disabled:opacity-50";
const field = "flex-1 rounded bg-slate-800 px-2 py-1";

export function AddPersonForm() {
	const addPerson = usePeopleStore((s) => s.addPerson);
	const busy = usePeopleStore((s) => s.busy);
	const [name, setName] = useState("");
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (await addPerson(name)) setName("");
	};
	return (
		<form onSubmit={submit} className="flex gap-2 text-sm">
			<input
				aria-label="New person's name"
				data-testid="new-person"
				className={field}
				placeholder="Add a person (no account needed)"
				maxLength={40}
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			<button
				type="submit"
				data-testid="add-person"
				className={button}
				disabled={busy || !name.trim()}
			>
				Add
			</button>
		</form>
	);
}

/** The active person's own opt-in. Off by default; only the chosen public name is shown. */
export function VisibilityPanel() {
	const visibility = usePeopleStore((s) => s.visibility);
	const profile = usePeopleStore((s) => s.profile);
	const { setVisible, hide, busy } = usePeopleStore();
	const [publicName, setPublicName] = useState("");
	if (!visibility || !profile) return null;
	return (
		<section
			aria-labelledby="vis"
			className="mt-6 grid gap-2 rounded border border-slate-800 p-3 text-sm"
		>
			<h2 id="vis" className="font-medium">
				Visible on this device
			</h2>
			{visibility.visible ? (
				<div className="flex flex-wrap items-center gap-2">
					<span data-testid="visibility">
						On, as “{visibility.publicName}”. Others using this device can find
						and message you.
					</span>
					<button
						type="button"
						data-testid="hide"
						className={button}
						disabled={busy}
						onClick={() => void hide()}
					>
						Turn off
					</button>
				</div>
			) : (
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void setVisible(publicName || profile.displayName);
					}}
				>
					<span data-testid="visibility" className="sr-only">
						Off
					</span>
					<input
						aria-label="Name others on this device will see"
						data-testid="public-name"
						className={field}
						placeholder={`Shown as (default: ${profile.displayName})`}
						maxLength={40}
						value={publicName}
						onChange={(e) => setPublicName(e.target.value)}
					/>
					<button
						type="submit"
						data-testid="show"
						className={button}
						disabled={busy}
					>
						Turn on
					</button>
				</form>
			)}
			<p className="text-slate-400">
				Off by default. Turning it off hides you from new searches; your library
				and existing conversations are kept.
			</p>
		</section>
	);
}

export function DeviceDirectory() {
	const directory = usePeopleStore((s) => s.directory);
	const { openWith, busy } = usePeopleStore();
	return (
		<section aria-labelledby="dir" className="mt-6 text-sm">
			<h2 id="dir" className="font-medium">
				On this device
			</h2>
			{directory.length === 0 ? (
				<p data-testid="directory-empty" className="text-slate-400">
					Nobody else on this device has turned on visibility.
				</p>
			) : (
				<ul data-testid="directory" className="mt-2 grid gap-2">
					{directory.map((entry) => (
						<li
							key={entry.profileId}
							className="flex items-center justify-between rounded bg-slate-900 p-2"
						>
							<span data-testid="directory-name">{entry.publicName}</span>
							<button
								type="button"
								className={button}
								disabled={busy}
								aria-label={`Message ${entry.publicName}`}
								onClick={() => void openWith(entry.profileId)}
							>
								Message
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export function ConversationList() {
	const conversations = usePeopleStore((s) => s.conversations);
	const openConversation = usePeopleStore((s) => s.openConversation);
	if (!conversations.length) return null;
	return (
		<section aria-labelledby="convs" className="mt-6 text-sm">
			<h2 id="convs" className="font-medium">
				Conversations on this device
			</h2>
			<ul data-testid="conversations" className="mt-2 grid gap-2">
				{conversations.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							data-testid="conversation"
							className="w-full rounded bg-slate-900 p-2 text-left"
							onClick={() => void openConversation(c.id)}
						>
							<strong>{c.others.map((o) => o.publicName).join(", ")}</strong>
							{c.lastMessage && (
								<span className="block truncate text-slate-400">
									{c.lastMessage.body}
								</span>
							)}
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
