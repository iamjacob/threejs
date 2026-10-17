import { useEffect, useState } from "react";
import { requestScanMetadata, type ScanMetadata } from "./scanMetadata";
export default function ScanMetadataFeedback({
	image,
	scanId,
	busy,
	onApply,
}: {
	image?: string;
	scanId: string;
	busy: boolean;
	onApply: (metadata: ScanMetadata) => void;
}) {
	const [retry, setRetry] = useState(0);
	const [result, setResult] = useState<ScanMetadata | null>(null);
	const [status, setStatus] = useState("");
	useEffect(() => {
		setResult(null);
		if (!image) {
			setStatus("Crop the front cover to identify your book.");
			return;
		}
		const controller = new AbortController();
		let active = true;
		setStatus("Reading title and author…");
		let timeout: ReturnType<typeof setTimeout>;
		const timer = setTimeout(() => {
			timeout = setTimeout(() => controller.abort(), 20000);
			void requestScanMetadata(image, scanId, controller.signal)
				.then((metadata) => {
					if (!active) return;
					setResult(metadata);
					setStatus(
						Object.values(metadata).some(Boolean)
							? "AI suggestions — review before using."
							: "No book details found. Try a clearer cover.",
					);
				})
				.catch(() => {
					if (active)
						setStatus(
							"AI is unavailable right now. You can still enter details yourself.",
						);
				})
				.finally(() => clearTimeout(timeout));
		}, 600);
		return () => {
			active = false;
			clearTimeout(timer);
			clearTimeout(timeout);
			controller.abort();
		};
	}, [image, scanId, retry]);
	return (
		<aside className="scan-ai-feedback" aria-label="AI book details">
			<p role="status">{status}</p>
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
			{image && !status.startsWith("Reading") && (
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
