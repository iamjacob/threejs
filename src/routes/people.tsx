import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import {
	AddPersonForm,
	ConversationList,
	DeviceDirectory,
	VisibilityPanel,
} from "../components/people/PeoplePanels";
import { Thread } from "../components/people/Thread";
import AppShell from "../components/shell/AppShell";
import { usePeopleStore } from "../stores/usePeopleStore";

/**
 * Several people on one device, offline: switch person, opt in to "On this device", and send
 * same-device messages. Plain UI, no Three.js. Everything here is local to this device.
 */
export const Route = createFileRoute("/people")({ component: PeoplePage });

function PeoplePage() {
	const status = usePeopleStore((s) => s.status);
	const error = usePeopleStore((s) => s.error);
	const profile = usePeopleStore((s) => s.profile);
	const profiles = usePeopleStore((s) => s.profiles);
	const message = usePeopleStore((s) => s.message);
	const openId = usePeopleStore((s) => s.openId);
	const switchTo = usePeopleStore((s) => s.switchTo);

	useEffect(() => {
		void usePeopleStore.getState().boot();
	}, []);

	if (status === "locked")
		return (
			<Shell>
				<p data-testid="locked">
					Boooks is open in another tab. Close it to continue here.
				</p>
			</Shell>
		);
	if (status === "error")
		return (
			<Shell>
				<p role="alert">Could not open local storage: {error}</p>
			</Shell>
		);
	// Loading boundary: while booting or switching there is no profile, so no personal data renders.
	if (status !== "ready" || !profile)
		return (
			<Shell>
				<p data-testid="people-loading" aria-live="polite">
					Opening…
				</p>
			</Shell>
		);

	return (
		<Shell>
			<section aria-labelledby="who" className="grid gap-2">
				<h2 id="who" className="text-sm text-slate-400">
					Who is using this device?
				</h2>
				<div className="flex flex-wrap items-center gap-2">
					<span data-testid="active-person" className="font-medium">
						{profile.displayName}
					</span>
					<label className="text-sm">
						<span className="sr-only">Switch person</span>
						<select
							data-testid="switch-person"
							aria-label="Switch person"
							className="rounded bg-slate-800 px-2 py-1"
							value={profile.id}
							onChange={(e) => void switchTo(e.target.value)}
						>
							{profiles.map((p) => (
								<option key={p.id} value={p.id}>
									{p.displayName}
								</option>
							))}
						</select>
					</label>
				</div>
				<AddPersonForm />
			</section>

			{message && (
				<output
					data-testid="people-message"
					className="mt-3 block text-amber-300"
				>
					{message}
				</output>
			)}

			<VisibilityPanel />
			{openId ? (
				<Thread />
			) : (
				<>
					<DeviceDirectory />
					<ConversationList />
				</>
			)}

			<p className="mt-8 text-xs text-slate-500">
				People and messages here stay on this device only; nothing is sent to
				other devices or a server. Switching person keeps each person&apos;s
				things apart in the app, but it is not encryption: anyone with this
				device can access its storage.
			</p>
		</Shell>
	);
}

function Shell({ children }: { children: ReactNode }) {
	return <AppShell title="People on this device">{children}</AppShell>;
}
