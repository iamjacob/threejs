import type { FormEvent } from "react";
import { usePeopleStore } from "../../stores/usePeopleStore";

/** Status text for the composer. "Saved on this device" is the strongest claim made: no receipts. */
const SEND_LABEL = {
	idle: "",
	saving: "Saving…",
	saved: "Saved on this device",
	error: "Not saved. Try again.",
} as const;

export function Thread() {
	const profile = usePeopleStore((s) => s.profile);
	const openId = usePeopleStore((s) => s.openId);
	const messages = usePeopleStore((s) => s.messages);
	const conversations = usePeopleStore((s) => s.conversations);
	const draft = usePeopleStore((s) => s.draft);
	const sendState = usePeopleStore((s) => s.sendState);
	const busy = usePeopleStore((s) => s.busy);
	const { setDraft, send, closeConversation } = usePeopleStore();
	const conversation = conversations.find((c) => c.id === openId);
	if (!profile || !openId) return null;
	const names = new Map(
		(conversation?.others ?? []).map((o) => [o.profileId, o.publicName]),
	);
	const title = conversation?.others.map((o) => o.publicName).join(", ") ?? "";

	const submit = (e: FormEvent) => {
		e.preventDefault();
		void send();
	};

	return (
		<section aria-labelledby="thread" className="mt-6 grid gap-3 text-sm">
			<div className="flex items-center justify-between">
				<h2 id="thread" className="font-medium" data-testid="thread-title">
					{title}{" "}
					<span className="text-xs text-slate-400">· on this device</span>
				</h2>
				<button
					type="button"
					className="text-sky-300"
					onClick={closeConversation}
				>
					Back
				</button>
			</div>
			<ol data-testid="messages" aria-live="polite" className="grid gap-2">
				{messages.map((m) => {
					const mine = m.authorProfileId === profile.id;
					return (
						<li
							key={m.id}
							data-testid="message"
							className={`rounded p-2 ${mine ? "justify-self-end bg-sky-900" : "justify-self-start bg-slate-800"}`}
						>
							<span className="block text-xs text-slate-400">
								{mine ? "You" : (names.get(m.authorProfileId) ?? "Someone")}
							</span>
							<span data-testid="message-body" className="whitespace-pre-wrap">
								{m.body}
							</span>
						</li>
					);
				})}
			</ol>
			<form onSubmit={submit} className="flex gap-2">
				<textarea
					aria-label="Message"
					data-testid="compose"
					className="flex-1 rounded bg-slate-800 px-2 py-1"
					rows={2}
					maxLength={2000}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
				/>
				<button
					type="submit"
					data-testid="send"
					className="rounded bg-sky-600 px-3 py-1 font-medium disabled:opacity-50"
					disabled={busy || !draft.trim()}
				>
					Send
				</button>
			</form>
			<output
				data-testid="send-state"
				aria-live="polite"
				className="text-xs text-slate-400"
			>
				{SEND_LABEL[sendState]}
			</output>
		</section>
	);
}
