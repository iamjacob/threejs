import {
	BookOpen,
	CheckCheck,
	MessageSquarePlus,
	Search,
	Send,
	Sparkles,
	UserPlus,
	Users,
	X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryBooks, useSelectedBook } from "../../stores/useBookStore";

type ChatMessage = {
	id: string;
	sender: "me" | "friend";
	text: string;
	time: string;
	bookTitle?: string;
};

type FriendThread = {
	id: string;
	name: string;
	handle: string;
	avatarBg: string;
	initials: string;
	status: "online" | "reading" | "offline";
	readingBook: string;
	messages: ChatMessage[];
};

const STORAGE_KEY = "boooks-messages-v1";

const INITIAL_FRIENDS: FriendThread[] = [
	{
		id: "freja",
		name: "Freja Lindqvist",
		handle: "@freja.reads",
		avatarBg: "from-[#e22424] to-[#7c1414]",
		initials: "FL",
		status: "reading",
		readingBook: "Shaolin Spirit",
		messages: [
			{
				id: "m1",
				sender: "friend",
				text: "Have you tried the new 3D shelf view yet? The lighting on the spines looks unreal.",
				time: "18:14",
			},
			{
				id: "m2",
				sender: "me",
				text: "Yes! Just arranged my top shelf and started reading Shaolin Spirit.",
				time: "18:16",
				bookTitle: "Shaolin Spirit",
			},
			{
				id: "m3",
				sender: "friend",
				text: "Send me your favorite quote when you reach chapter 4!",
				time: "18:19",
			},
		],
	},
	{
		id: "mikkel",
		name: "Mikkel Sørensen",
		handle: "@mikkels",
		avatarBg: "from-[#2563eb] to-[#1e3a8a]",
		initials: "MS",
		status: "online",
		readingBook: "Discipline Is Destiny",
		messages: [
			{
				id: "m4",
				sender: "me",
				text: "Finished the chapter on daily rituals—definitely made me rethink my morning routine.",
				time: "Yesterday",
				bookTitle: "Discipline Is Destiny",
			},
			{
				id: "m5",
				sender: "friend",
				text: "Right? Let's do a 25-minute reading sprint tonight.",
				time: "Yesterday",
			},
		],
	},
	{
		id: "astrid",
		name: "Astrid Nørgaard",
		handle: "@astrid.n",
		avatarBg: "from-[#10b981] to-[#065f46]",
		initials: "AN",
		status: "reading",
		readingBook: "Behave",
		messages: [
			{
				id: "m6",
				sender: "friend",
				text: "Scanned two hardcovers from my desk onto my shelf—worked on the first try!",
				time: "Tue",
			},
			{
				id: "m7",
				sender: "me",
				text: "Love that! Share a screenshot of your shelf setup when you're done.",
				time: "Tue",
			},
		],
	},
	{
		id: "kasper",
		name: "Kasper Holm",
		handle: "@kholm",
		avatarBg: "from-[#f59e0b] to-[#92400e]",
		initials: "KH",
		status: "offline",
		readingBook: "What's Your Dream?",
		messages: [
			{
				id: "m8",
				sender: "me",
				text: "Recommended this one for your weekend reading list.",
				time: "Mon",
				bookTitle: "What's Your Dream?",
			},
		],
	},
];

function loadThreads(): FriendThread[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return INITIAL_FRIENDS;
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length > 0) return parsed;
	} catch {
		/* Use defaults when storage is unavailable. */
	}
	return INITIAL_FRIENDS;
}

export default function MessagesOverlay({ onClose }: { onClose: () => void }) {
	const [threads, setThreads] = useState<FriendThread[]>(loadThreads);
	const [activeId, setActiveId] = useState<string>(
		() => threads[0]?.id ?? "freja",
	);
	const [tab, setTab] = useState<"messages" | "friends">("messages");
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState("");
	const [attachCurrentBook, setAttachCurrentBook] = useState(false);
	const [newFriendName, setNewFriendName] = useState("");
	const [addingFriend, setAddingFriend] = useState(false);
	const selectedBook = useSelectedBook();
	const books = useLibraryBooks();
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
		} catch {
			/* Keep in-memory state for this session. */
		}
	}, [threads]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const activeThread = useMemo(
		() => threads.find((item) => item.id === activeId) ?? threads[0],
		[threads, activeId],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Scroll to bottom whenever the active conversation or message count changes.
	useEffect(() => {
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [activeThread?.id, activeThread?.messages.length]);

	const filteredThreads = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return threads;
		return threads.filter(
			(friend) =>
				friend.name.toLowerCase().includes(q) ||
				friend.handle.toLowerCase().includes(q) ||
				friend.readingBook.toLowerCase().includes(q) ||
				friend.messages.some((m) => m.text.toLowerCase().includes(q)),
		);
	}, [threads, query]);

	const sendMessage = (event: FormEvent) => {
		event.preventDefault();
		const text = draft.trim();
		if (!text || !activeThread) return;
		const now = new Date();
		const time = now.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
		const message: ChatMessage = {
			id: `msg-${Date.now()}`,
			sender: "me",
			text,
			time,
			bookTitle: attachCurrentBook ? selectedBook.title : undefined,
		};
		setThreads((current) =>
			current.map((thread) =>
				thread.id === activeThread.id
					? { ...thread, messages: [...thread.messages, message] }
					: thread,
			),
		);
		setDraft("");
		setAttachCurrentBook(false);
	};

	const handleAddFriend = (event: FormEvent) => {
		event.preventDefault();
		const name = newFriendName.trim();
		if (!name) return;
		const initials = name
			.split(/\s+/)
			.map((part) => part[0]?.toUpperCase() ?? "")
			.join("")
			.slice(0, 2);
		const randomBook =
			books[Math.floor(Math.random() * books.length)]?.title ??
			selectedBook.title;
		const id = `friend-${Date.now()}`;
		const created: FriendThread = {
			id,
			name,
			handle: `@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
			avatarBg: "from-[#8b5cf6] to-[#4c1d95]",
			initials: initials || "BK",
			status: "online",
			readingBook: randomBook,
			messages: [
				{
					id: `welcome-${Date.now()}`,
					sender: "me",
					text: `Hey ${name.split(" ")[0]}! Connected with you on Boooks.`,
					time: "Just now",
					bookTitle: selectedBook.title,
				},
			],
		};
		setThreads((current) => [created, ...current]);
		setActiveId(id);
		setNewFriendName("");
		setAddingFriend(false);
		setTab("messages");
	};
	return (
		<div
			className="fixed inset-0 z-[2100] flex items-center justify-center bg-[#040711]/75 p-3 backdrop-blur-md animate-in fade-in duration-200 sm:p-6"
			role="dialog"
			aria-modal="true"
			aria-label="Messages and friends"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
		>
			<div className="flex h-[min(640px,88vh)] w-full max-w-4xl overflow-hidden rounded-3xl border border-white/12 bg-[#0b1022]/95 text-[#f5efe2] shadow-[0_32px_90px_rgba(0,0,0,0.75)]">
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
							onClick={() => setTab("messages")}
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
							onClick={() => setTab("friends")}
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
							onSubmit={handleAddFriend}
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
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search messages or friends..."
								className="w-full bg-transparent text-xs text-white placeholder:text-white/40 focus:outline-none"
							/>
						</div>
					</div>

					<div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
						{filteredThreads.map((friend) => {
							const lastMsg = friend.messages.at(-1);
							const active = friend.id === activeThread?.id;
							return (
								<button
									key={friend.id}
									type="button"
									onClick={() => {
										setActiveId(friend.id);
										setTab("messages");
									}}
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
												<BookOpen
													size={11}
													className="shrink-0 text-[#e22424]"
												/>
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

				<section className="flex min-w-0 flex-1 flex-col bg-gradient-to-b from-[#0e152d]/60 to-[#080c1a]/90">
					<header className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
						{activeThread ? (
							<div className="flex min-w-0 items-center gap-3">
								<div
									className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${activeThread.avatarBg} text-xs font-bold text-white`}
								>
									{activeThread.initials}
								</div>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<h3 className="truncate font-semibold text-sm text-white">
											{activeThread.name}
										</h3>
										<span className="text-xs text-white/45">
											{activeThread.handle}
										</span>
									</div>
									<p className="flex items-center gap-1.5 truncate text-xs text-white/65">
										<BookOpen size={12} className="text-[#e22424]" />
										<span>Reading “{activeThread.readingBook}”</span>
									</p>
								</div>
							</div>
						) : (
							<div />
						)}
						<button
							type="button"
							onClick={onClose}
							aria-label="Close messages"
							className="rounded-full border border-white/10 bg-white/5 p-2 text-white/75 transition hover:bg-white/12 hover:text-white"
						>
							<X size={16} />
						</button>
					</header>

					<div
						ref={listRef}
						className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
					>
						{activeThread?.messages.map((msg) => {
							const mine = msg.sender === "me";
							return (
								<div
									key={msg.id}
									className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
								>
									{msg.bookTitle && (
										<div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-[#e22424]/40 bg-[#e22424]/15 px-2.5 py-0.5 text-[11px] text-[#ffd7d7]">
											<Sparkles size={11} />
											<span>Shared book: {msg.bookTitle}</span>
										</div>
									)}
									<div
										className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow ${
											mine
												? "rounded-br-sm bg-gradient-to-br from-[#9e1919] to-[#e22424] text-white"
												: "rounded-bl-sm border border-white/10 bg-white/[0.07] text-[#f5efe2]"
										}`}
									>
										{msg.text}
									</div>
									<div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-white/45">
										<span>{msg.time}</span>
										{mine && (
											<CheckCheck size={12} className="text-[#e22424]" />
										)}
									</div>
								</div>
							);
						})}
					</div>

					<form
						onSubmit={sendMessage}
						className="border-t border-white/10 bg-[#080c1a]/90 px-4 py-3"
					>
						<div className="mb-2 flex items-center justify-between gap-2">
							<button
								type="button"
								onClick={() => setAttachCurrentBook((v) => !v)}
								className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
									attachCurrentBook
										? "border-[#e22424] bg-[#e22424]/20 text-white"
										: "border-white/10 bg-white/5 text-white/65 hover:text-white"
								}`}
							>
								<BookOpen size={12} />
								<span className="truncate max-w-[220px]">
									{attachCurrentBook
										? `Attached: ${selectedBook.title}`
										: `Attach “${selectedBook.title}”`}
								</span>
							</button>
							<span className="text-[11px] text-white/40">
								Saved to your shelf messages
							</span>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="text"
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder={
									activeThread
										? `Message ${activeThread.name.split(" ")[0]}...`
										: "Write a message..."
								}
								className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#e22424] focus:outline-none"
							/>
							<button
								type="submit"
								disabled={!draft.trim()}
								aria-label="Send message"
								className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7C1414] to-[#E22424] text-white shadow transition hover:brightness-110 disabled:opacity-40"
							>
								<Send size={16} />
							</button>
						</div>
					</form>
				</section>
			</div>
		</div>
	);
}
