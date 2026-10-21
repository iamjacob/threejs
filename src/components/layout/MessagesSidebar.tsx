import {
	BookOpen,
	MessageSquarePlus,
	Search,
	UserPlus,
	Users,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import type { FriendThread } from "./messagesData";

export default function MessagesSidebar({
	threads,
	filteredThreads,
	activeId,
	tab,
	query,
	onSelectThread,
	onChangeTab,
	onChangeQuery,
	onAddFriend,
}: {
	threads: FriendThread[];
	filteredThreads: FriendThread[];
	activeId: string | undefined;
	tab: "messages" | "friends";
	query: string;
	onSelectThread: (id: string) => void;
	onChangeTab: (tab: "messages" | "friends") => void;
	onChangeQuery: (query: string) => void;
	onAddFriend: (name: string) => void;
}) {
	const [addingFriend, setAddingFriend] = useState(false);
	const [newFriendName, setNewFriendName] = useState("");

	const submitFriend = (event: FormEvent) => {
		event.preventDefault();
		const name = newFriendName.trim();
		if (!name) return;
		onAddFriend(name);
		setNewFriendName("");
		setAddingFriend(false);
	};

	return (
		<aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#080c1a]/80 sm:w-80">
			<div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
				<div className="flex items-center gap-2">
					<span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#e22424] shadow-[0_0_8px_#e22424]" />
					<h2 className="font-semibold text-sm tracking-wide uppercase text-white/90">
						Boooks Social
					</h2>
				</div>
				<button
					type="button"
					onClick={() => setAddingFriend((v) => !v)}
					className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs text-white/80 transition hover:bg-white/10 hover:text-white"
					title="Add friend"
				>
					<UserPlus size={13} />
					<span>Add</span>
				</button>
			</div>

			<div className="grid grid-cols-2 gap-1 border-b border-white/10 p-2">
				<button
					type="button"
					onClick={() => onChangeTab("messages")}
					className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-medium transition ${
						tab === "messages"
							? "bg-gradient-to-r from-[#7C1414] to-[#E22424] text-white shadow"
							: "text-white/60 hover:bg-white/5 hover:text-white"
					}`}
				>
					<MessageSquarePlus size={14} />
					<span>Messages</span>
				</button>
				<button
					type="button"
					onClick={() => onChangeTab("friends")}
					className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-medium transition ${
						tab === "friends"
							? "bg-gradient-to-r from-[#7C1414] to-[#E22424] text-white shadow"
							: "text-white/60 hover:bg-white/5 hover:text-white"
					}`}
				>
					<Users size={14} />
					<span>Friends ({threads.length})</span>
				</button>
			</div>

			{addingFriend && (
				<form
					onSubmit={submitFriend}
					className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-3 py-2.5"
				>
					<input
						type="text"
						value={newFriendName}
						onChange={(e) => setNewFriendName(e.target.value)}
						placeholder="Friend's name..."
						className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#050813] px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-[#e22424] focus:outline-none"
					/>
					<button
						type="submit"
						className="rounded-lg bg-[#e22424] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#c81e1e]"
					>
						Connect
					</button>
				</form>
			)}

			<div className="px-3 py-2.5">
				<div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5">
					<Search size={14} className="text-white/45" />
					<input
						type="search"
						value={query}
						onChange={(e) => onChangeQuery(e.target.value)}
						placeholder="Search messages or friends..."
						className="w-full bg-transparent text-xs text-white placeholder:text-white/40 focus:outline-none"
					/>
				</div>
			</div>

			<div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
				{filteredThreads.map((friend) => {
					const lastMsg = friend.messages.at(-1);
					const active = friend.id === activeId;
					return (
						<button
							key={friend.id}
							type="button"
							onClick={() => onSelectThread(friend.id)}
							className={`flex w-full items-start gap-3 rounded-2xl p-2.5 text-left transition ${
								active
									? "bg-white/[0.11] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
									: "hover:bg-white/[0.05]"
							}`}
						>
							<div className="relative shrink-0">
								<div
									className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${friend.avatarBg} text-xs font-bold text-white shadow`}
								>
									{friend.initials}
								</div>
								<span
									className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#080c1a] ${
										friend.status === "online"
											? "bg-emerald-400"
											: friend.status === "reading"
												? "bg-[#e22424]"
												: "bg-white/30"
									}`}
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-1">
									<span className="truncate font-medium text-sm text-white">
										{friend.name}
									</span>
									<span className="shrink-0 text-[10px] text-white/45">
										{lastMsg?.time}
									</span>
								</div>
								{tab === "friends" ? (
									<p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/65">
										<BookOpen size={11} className="shrink-0 text-[#e22424]" />
										<span className="truncate">{friend.readingBook}</span>
									</p>
								) : (
									<p className="mt-0.5 truncate text-xs text-white/60">
										{lastMsg?.sender === "me" ? "You: " : ""}
										{lastMsg?.text}
									</p>
								)}
							</div>
						</button>
					);
				})}
			</div>
		</aside>
	);
}
