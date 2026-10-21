export type ChatMessage = {
	id: string;
	sender: "me" | "friend";
	text: string;
	time: string;
	bookTitle?: string;
};

export type FriendThread = {
	id: string;
	name: string;
	handle: string;
	avatarBg: string;
	initials: string;
	status: "online" | "reading" | "offline";
	readingBook: string;
	messages: ChatMessage[];
};

export const MESSAGES_STORAGE_KEY = "boooks-messages-v1";

export const INITIAL_FRIENDS: FriendThread[] = [
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

export function loadThreads(): FriendThread[] {
	try {
		const raw = localStorage.getItem(MESSAGES_STORAGE_KEY);
		if (!raw) return INITIAL_FRIENDS;
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length > 0) return parsed;
	} catch {
		/* Use defaults when storage is unavailable. */
	}
	return INITIAL_FRIENDS;
}
