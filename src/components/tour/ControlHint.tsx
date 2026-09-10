import type { ReactNode } from "react";

export default function ControlHint({
	hint,
	children,
}: {
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="relative flex w-11 items-center justify-center">
			{children}
			{hint && (
				<span className="tour-control-hint pointer-events-none absolute right-[calc(100%+0.5rem)] top-1/2 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#080d1a]/75 py-1 pl-3 pr-1 text-sm font-medium text-white sm:text-base">
					{hint}
					<svg
						viewBox="0 0 36 24"
						className="h-6 w-9"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M2 17Q16 2 32 12M24 5l8 7-10 2" />
					</svg>
				</span>
			)}
		</div>
	);
}
