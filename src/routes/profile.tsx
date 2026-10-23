import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import AppShell from "../components/shell/AppShell";
import { usePeopleStore } from "../stores/usePeopleStore";

/**
 * Active local profile and account connection state. Read-mostly: switching person reuses the
 * existing session flow (clear → persist → ready), so while switching there is no profile in the
 * store and only the neutral loading state renders, never the previous person's details.
 * There is no remote account provider, so nothing here claims sign-in or sync.
 */
export const Route = createFileRoute("/profile")({ component: ProfilePage });

const KIND: Record<string, string> = {
	guest: "Guest on this device",
	local: "Local person on this device",
	account: "Local account profile (not connected to a server)",
};

function ProfilePage() {
	const status = usePeopleStore((s) => s.status);
	const error = usePeopleStore((s) => s.error);
	const profile = usePeopleStore((s) => s.profile);
	const profiles = usePeopleStore((s) => s.profiles);
	const visibility = usePeopleStore((s) => s.visibility);
	const switchTo = usePeopleStore((s) => s.switchTo);
	const message = usePeopleStore((s) => s.message);

	useEffect(() => {
		void usePeopleStore.getState().boot();
	}, []);

	if (status === "locked")
		return (
			<AppShell title="Profile">
				<p data-testid="locked">
					Boooks is open in another tab. Close it to continue here.
				</p>
			</AppShell>
		);
	if (status === "error")
		return (
			<AppShell title="Profile">
				<p role="alert">Could not open local storage: {error}</p>
			</AppShell>
		);
	if (status !== "ready" || !profile)
		return (
			<AppShell title="Profile">
				<p data-testid="profile-loading" aria-live="polite">
					Opening…
				</p>
			</AppShell>
		);

	const choices = profiles.filter((p) => !p.mergedInto);
	return (
		<AppShell title="Profile">
			<section
				aria-labelledby="profile-who"
				className="grid gap-3 rounded-2xl bg-white/5 p-4"
				data-testid="profile-card"
			>
				<h2 id="profile-who" className="sr-only">
					Active person
				</h2>
				<p className="text-lg font-medium" data-testid="profile-name">
					{profile.displayName}
				</p>
				<p className="text-sm text-slate-300" data-testid="profile-kind">
					{KIND[profile.kind] ?? profile.kind}
				</p>
				<p className="text-sm text-slate-300" data-testid="profile-visibility">
					{visibility?.visible
						? `Visible to others on this device as “${visibility.publicName}”.`
						: "Not visible to others on this device."}
				</p>
				{choices.length > 1 && (
					<label className="grid gap-1 text-sm">
						<span>Switch person</span>
						<select
							data-testid="profile-switch"
							className="min-h-11 rounded-lg bg-slate-800 px-3"
							value={profile.id}
							onChange={(e) => void switchTo(e.target.value)}
						>
							{choices.map((p) => (
								<option key={p.id} value={p.id}>
									{p.displayName}
								</option>
							))}
						</select>
					</label>
				)}
			</section>

			{message && (
				<output className="mt-3 block text-amber-300">{message}</output>
			)}

			<section aria-labelledby="profile-account" className="mt-6 grid gap-2">
				<h2 id="profile-account" className="font-medium">
					Account connection
				</h2>
				<p className="text-sm text-slate-300" data-testid="profile-account">
					Not connected. Online accounts are not available yet, so nothing is
					backed up or synced to other devices. Your books, notes and messages
					are saved on this device only.
				</p>
			</section>

			<nav aria-label="Profile pages" className="mt-6 grid gap-2">
				<Link
					to="/people"
					className="flex min-h-12 flex-col justify-center rounded-xl bg-white/5 px-4 py-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
				>
					<span className="font-medium">People & messages</span>
					<span className="text-xs text-slate-400">
						Others on this device, and messages saved on this device only.
					</span>
				</Link>
				<Link
					to="/library"
					className="flex min-h-12 items-center rounded-xl bg-white/5 px-4 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
				>
					Your library
				</Link>
				<Link
					to="/notes"
					className="flex min-h-12 items-center rounded-xl bg-white/5 px-4 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
				>
					Notes
				</Link>
				<Link
					to="/more"
					className="flex min-h-12 items-center rounded-xl bg-white/5 px-4 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
				>
					All pages
				</Link>
			</nav>

			<p className="mt-8 text-xs text-slate-500">
				Switching person keeps each person&apos;s things apart in the app, but
				it is not encryption: anyone with this device can access its storage.
			</p>
		</AppShell>
	);
}
