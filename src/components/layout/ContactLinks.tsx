import { Mail, MessageCircle } from "lucide-react";
import GitHubIcon from "./GitHubIcon";

const contacts = [
	{
		label: "GitHub",
		href: "https://github.com/iamjacob/threejs/tree/main/src/components",
		Icon: GitHubIcon,
	},
	{
		label: "Discord",
		href: "https://discord.gg/Q6C82p9X",
		Icon: MessageCircle,
	},
	{ label: "Email Jacob", href: "mailto:jacob@boooks.app", Icon: Mail },
];

export default function ContactLinks() {
	return (
		<nav
			aria-label="Contact Jacob"
			className="flex flex-wrap items-center gap-2"
		>
			{contacts.map(({ label, href, Icon }) => (
				<a
					key={href}
					href={href}
					aria-label={label}
					title={label === "Email Jacob" ? "jacob@boooks.app" : label}
					target={href.startsWith("https:") ? "_blank" : undefined}
					rel={href.startsWith("https:") ? "noopener noreferrer" : undefined}
					className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-base text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
				>
					<Icon size={18} strokeWidth={1.6} aria-hidden="true" />
					<span>{label === "Email Jacob" ? "jacob@boooks.app" : label}</span>
				</a>
			))}
		</nav>
	);
}
