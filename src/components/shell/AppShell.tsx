import { Link } from "@tanstack/react-router";
import {
	CircleUserRound,
	LayoutGrid,
	Library,
	Map as MapIcon,
	ScanLine,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import {
	type LiveRoute,
	moreGroups,
	primaryLinks,
} from "../../lib/routeRegistry";

const ICONS: Record<string, typeof Library> = {
	library: Library,
	scan: ScanLine,
	maps: MapIcon,
	profile: CircleUserRound,
};

const linkBase =
	"rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * The one page shell for non-immersive routes (Notes, People, Profile, More, not-found).
 * Immersive worlds (shelves, scanner, Maps) render without it. Mobile: a compact bottom bar with
 * the primary destinations and an "All pages" link. Desktop: the same links in the header plus the
 * grouped GIGA footer. Every link comes from the route registry, so only live routes appear.
 */
export default function AppShell({
	title,
	children,
	wide = false,
}: {
	title: string;
	children: ReactNode;
	wide?: boolean;
}) {
	const heading = useRef<HTMLHeadingElement>(null);
	// After a route change the clicked link has unmounted, so focus would fall to <body>.
	// Move it to the page heading instead (screen readers announce where you are).
	useEffect(() => {
		const active = document.activeElement;
		if (!active || active === document.body)
			heading.current?.focus({ preventScroll: true });
	}, []);

	return (
		<div className="min-h-dvh bg-[#06192e] text-slate-100">
			<header className="sticky top-0 z-20 border-b border-white/10 bg-[#06192e]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
					<Link
						to="/"
						className={`${linkBase} flex min-h-11 items-center`}
						aria-label="Boooks, go to Library"
					>
						<img
							src={`${import.meta.env.BASE_URL}icons/wordmark-gradient.svg`}
							alt=""
							className="h-auto w-[84px]"
						/>
					</Link>
					<nav
						aria-label="Primary"
						className="ml-auto hidden items-center gap-1 md:flex"
					>
						{primaryLinks().map((r) => (
							<PrimaryLink key={r.id} route={r} variant="top" />
						))}
					</nav>
					<Link
						to="/more"
						activeOptions={{ exact: true }}
						className={`${linkBase} ml-auto flex min-h-11 items-center gap-2 px-3 text-sm text-sky-200 hover:bg-white/10 aria-[current=page]:bg-white/10 md:ml-0`}
					>
						<LayoutGrid size={18} aria-hidden="true" />
						All pages
					</Link>
				</div>
			</header>

			<main
				className={`mx-auto px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-12 ${wide ? "max-w-3xl" : "max-w-xl"}`}
			>
				<h1
					ref={heading}
					tabIndex={-1}
					className="mb-4 text-xl font-semibold outline-none"
				>
					{title}
				</h1>
				{children}
			</main>

			<GigaFooter />

			<nav
				aria-label="Primary"
				className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#071a30]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
			>
				<ul className="mx-auto flex max-w-md items-stretch justify-around">
					{primaryLinks().map((r) => (
						<li key={r.id} className="flex-1">
							<PrimaryLink route={r} variant="bottom" />
						</li>
					))}
				</ul>
			</nav>
		</div>
	);
}

function PrimaryLink({
	route,
	variant,
}: {
	route: LiveRoute;
	variant: "top" | "bottom";
}) {
	const Icon = ICONS[route.id] ?? LayoutGrid;
	const scan = route.id === "scan";
	if (variant === "top")
		return (
			<Link
				to={route.path}
				activeOptions={{ exact: true }}
				className={`${linkBase} flex min-h-11 items-center gap-2 px-3 text-sm hover:bg-white/10 aria-[current=page]:bg-white/15 aria-[current=page]:font-semibold ${scan ? "text-[#ff6b6b]" : ""}`}
			>
				<Icon size={18} aria-hidden="true" />
				{route.label}
			</Link>
		);
	return (
		<Link
			to={route.path}
			activeOptions={{ exact: true }}
			className={`${linkBase} group flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-slate-300 aria-[current=page]:text-white`}
		>
			<span
				className={
					scan
						? "grid h-9 w-9 place-items-center rounded-full bg-[#d91b24] text-white shadow-[0_0_14px_rgba(217,27,36,.55)]"
						: "grid h-7 w-10 place-items-center rounded-full group-aria-[current=page]:bg-white/15"
				}
			>
				<Icon size={scan ? 20 : 19} aria-hidden="true" />
			</span>
			{route.label}
		</Link>
	);
}

/** Desktop GIGA footer: the same grouped destinations as the More page. Hidden on mobile. */
function GigaFooter() {
	return (
		<footer
			data-testid="giga-footer"
			className="hidden border-t border-white/10 bg-[#041322] md:block"
		>
			<div className="mx-auto grid max-w-5xl grid-cols-4 gap-8 px-4 py-10 text-sm">
				{moreGroups().map((g) => (
					<nav key={g.group} aria-label={g.label}>
						<h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
							{g.label}
						</h2>
						<ul className="grid gap-1">
							{g.links.map((r) => (
								<li key={r.id}>
									<Link
										to={r.path}
										activeOptions={{ exact: true }}
										className={`${linkBase} inline-flex min-h-9 items-center text-slate-200 hover:text-white aria-[current=page]:text-white aria-[current=page]:underline`}
									>
										{r.label}
									</Link>
								</li>
							))}
						</ul>
					</nav>
				))}
				<p className="text-xs leading-relaxed text-slate-400">
					Everything here is saved on this device. There is no online account or
					sync yet.
				</p>
			</div>
		</footer>
	);
}
