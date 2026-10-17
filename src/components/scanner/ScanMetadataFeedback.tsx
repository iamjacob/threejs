import { useEffect, useRef, useState } from "react";
import {
	requestScanMetadata,
	SCAN_TIMEOUT_MS,
	type ScanMetadata,
} from "./scanMetadata";
export default function ScanMetadataFeedback({
	image,
	busy,
	onSuggest,
	onApply,
}: {
	image?: string;
	busy: boolean;
	/** Called once per result; should fill only fields the user left empty. */
	onSuggest: (metadata: ScanMetadata) => void;
	/** Explicit "Use suggestions": overwrite all found fields. */
	onApply: (metadata: ScanMetadata) => void;
}) {
	const [retry, setRetry] = useState(0);
	const [result, setResult] = useState<ScanMetadata | null>(null);
	const [status, setStatus] = useState("");
	const [loading, setLoading] = useState(false);
	const suggest = useRef(onSuggest);
	suggest.current = onSuggest;
	useEffect(() => {
		setResult(null);
		setLoading(false);
		if (!image) {
			setStatus("Crop the front cover to identify your book.");
			return;
		}
		const controller = new AbortController();
		let active = true;
		let timedOut = false;
		setLoading(true);
		setStatus("Reading title and author…");
		let timeout: ReturnType<typeof setTimeout>;
		const timer = setTimeout(() => {
			timeout = setTimeout(() => {
				timedOut = true;
				controller.abort();
			}, SCAN_TIMEOUT_MS);
			void requestScanMetadata(image, controller.signal)
				.then((metadata) => {
					if (!active) return;
					setResult(metadata);
					if (Object.values(metadata).some(Boolean)) {
						suggest.current(metadata);
						setStatus(
							"AI suggestions added — check them, small words are sometimes missed.",
						);
					} else setStatus("No book details found. Try a clearer cover.");
				})
				.catch((error: unknown) => {
					if (!active) return;
					setStatus(
						timedOut
							? "Reading the cover took too long."
							: `${error instanceof Error && error.name === "ScanMetadataError" ? error.message : "AI is unavailable right now."} You can still enter details yourself.`,
					);
				})
				.finally(() => {
					clearTimeout(timeout);
					if (active) setLoading(false);
				});
		}, 600);
		return () => {
			active = false;
			clearTimeout(timer);
			clearTimeout(timeout);
			controller.abort();
		};
	}, [image, retry]);
	return (
		<aside
			className="scan-ai-feedback"
			aria-label="AI book details"
			aria-busy={loading}
		>
			<p role="status">
				{loading && <span className="scan-ai-spinner" aria-hidden="true" />}
				{status}
			</p>
			{result && (
				<dl>
					{(["title", "subtitle", "author"] as const).map((key) => (
						<div key={key}>
							<dt>{key}</dt>
							<dd>{result[key] || "Not found"}</dd>
						</div>
					))}
				</dl>
			)}
			{result && Object.values(result).some(Boolean) && (
				<button
					type="button"
					disabled={busy}
					onClick={() => {
						onApply(result);
						setStatus("Suggestions added. You can edit them in book details.");
					}}
				>
					Use suggestions
				</button>
			)}
			{image && !loading && (
				<button
					type="button"
					disabled={busy}
					onClick={() => setRetry((value) => value + 1)}
				>
					Try again
				</button>
			)}
		</aside>
	);
}
