import { createFileRoute, Link } from "@tanstack/react-router";
import AppShell from "../components/shell/AppShell";
import { moreGroups, pendingRoutes } from "../lib/routeRegistry";

/**
 * "All pages": the mobile form of the GIGA footer. It lists every page that works today, grouped,
 * then (unlinked) the pages that are planned or still need approved content, so nothing
 * unfinished ever looks live.
 */
export const Route = createFileRoute("/more")({ component: MorePage });

function MorePage() {
	const pending = pendingRoutes();
	return (
		<AppShell title="All pages">
			<div className="grid gap-6">
				{moreGroups().map((g) => (
					<section key={g.group} aria-labelledby={`more-${g.group}`}>
						<h2
							id={`more-${g.group}`}
							className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase"
						>
							{g.label}
						</h2>
						<ul className="grid gap-1" data-testid={`more-${g.group}`}>
							{g.links.map((r) => (
								<li key={r.id}>
									<Link
										to={r.path}
										className="flex min-h-12 flex-col justify-center rounded-xl bg-white/5 px-4 py-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
									>
										<span className="font-medium">{r.label}</span>
										<span className="text-xs text-slate-400">{r.purpose}</span>
									</Link>
								</li>
							))}
						</ul>
					</section>
				))}

				<section aria-labelledby="more-pending">
					<h2
						id="more-pending"
						className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase"
					>
						Not available yet
					</h2>
					<p className="mb-2 text-xs text-slate-400">
						These pages are planned. They are not links because they do not work
						yet.
					</p>
					<ul
						className="flex flex-wrap gap-2 text-xs text-slate-400"
						data-testid="more-pending"
					>
						{pending.map((r) => (
							<li
								key={r.id}
								className="rounded-full border border-white/10 px-3 py-1"
							>
								{r.label}
							</li>
						))}
					</ul>
				</section>
			</div>
		</AppShell>
	);
}
