import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { sceneTransition } from "../../stores/sceneTransition";
import AppShell from "./AppShell";

const action =
	"inline-flex min-h-11 items-center rounded-full px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Unknown URL (or a removed one such as the old /play): say so, and offer a way home. */
export function NotFound() {
	useEffect(() => sceneTransition.cancel(), []);
	return (
		<AppShell title="Page not found">
			<div data-testid="not-found" className="grid gap-4">
				<p className="text-slate-300">
					There is no page at this address. It may have moved, or the link may
					be wrong.
				</p>
				<div className="flex flex-wrap gap-2">
					<Link to="/" className={`${action} bg-[#d91b24] text-white`}>
						Go to your Library
					</Link>
					<Link to="/more" className={`${action} bg-white/10`}>
						See all pages
					</Link>
				</div>
			</div>
		</AppShell>
	);
}

/**
 * A route threw while loading or rendering (for example its code chunk could not be fetched
 * offline). Drops any world-transition cover so this is visible, and offers a retry.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
	useEffect(() => sceneTransition.cancel(), []);
	const offline = typeof navigator !== "undefined" && !navigator.onLine;
	return (
		<AppShell title="Something went wrong">
			<div data-testid="route-error" role="alert" className="grid gap-4">
				<p className="text-slate-300">
					{offline
						? "This page could not be opened while offline. It works again once you are back online, or after you have opened it once online."
						: "This page could not be opened."}
				</p>
				<p className="text-xs text-slate-500">
					{error instanceof Error ? error.message : String(error)}
				</p>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => {
							reset();
							window.location.reload();
						}}
						className={`${action} bg-[#d91b24] text-white`}
					>
						Try again
					</button>
					<Link to="/" className={`${action} bg-white/10`}>
						Go to your Library
					</Link>
				</div>
			</div>
		</AppShell>
	);
}
