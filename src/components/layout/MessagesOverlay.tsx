import { BookOpen, CheckCheck, Send, Sparkles, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryBooks, useSelectedBook } from "../../stores/useBookStore";
import MessagesSidebar from "./MessagesSidebar";
import {
	type ChatMessage,
	type FriendThread,
	loadThreads,
	MESSAGES_STORAGE_KEY,
} from "./messagesData";

export default function MessagesOverlay({ onClose }: { onClose: () => void }) {
	const [threads, setThreads] = useState<FriendThread[]>(loadThreads);
	const [activeId, setActiveId] = useState<string>(
		() => threads[0]?.id ?? "freja",
	);
	const [tab, setTab] = useState<"messages" | "friends">("messages");
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState("");
	const [attachCurrentBook, setAttachCurrentBook] = useState(false);
	const selectedBook = useSelectedBook();
	const books = useLibraryBooks();
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try {
			localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(threads));
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

	const handleAddFriend = (name: string) => {
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
				<MessagesSidebar
					threads={threads}
					filteredThreads={filteredThreads}
					activeId={activeThread?.id}
					tab={tab}
					query={query}
					onSelectThread={(id) => {
						setActiveId(id);
						setTab("messages");
					}}
					onChangeTab={setTab}
					onChangeQuery={setQuery}
					onAddFriend={handleAddFriend}
				/>

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
