import { ChevronDown, Globe, Library, Lock, WifiOff } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
	type ScannerDataMode,
	type ScannerModel,
	scannerDataModes,
	scannerModels,
} from "./scannerModels";

const MODE_ICONS = { online: Globe, offline: WifiOff, private: Lock } as const;

/** Header sign: "Scanner 0.4" (or the chosen version); opens a short list. */
export default function ScannerModelSelect({
	value,
	onChange,
	mode,
	onModeChange,
	onScanShelf,
	disabled,
}: {
	value: ScannerModel;
	onChange: (model: ScannerModel) => void;
	mode: ScannerDataMode;
	onModeChange: (mode: ScannerDataMode) => void;
	/** Optional: offer "Scan full shelf" under the versions. */
	onScanShelf?: () => void;
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const host = useRef<HTMLFieldSetElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const options = useRef<(HTMLButtonElement | null)[]>([]);
	const menuId = useId();
	const selected =
		scannerModels.find((model) => model.id === value) ?? scannerModels[0];

	useEffect(() => {
		if (!open) return;
		options.current[
			scannerModels.findIndex((model) => model.id === value)
		]?.focus();
		const outside = (event: PointerEvent) => {
			if (!host.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open, value]);

	return (
		<fieldset
			ref={host}
			className="scan-model-select"
			aria-label="Scanner version"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					event.stopPropagation();
					setOpen(false);
					trigger.current?.focus();
				}
			}}
		>
			<button
				ref={trigger}
				type="button"
				className="scan-model-trigger"
				aria-label={`Scanner ${selected.version}, ${selected.label}. Change version`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				disabled={disabled}
				title={selected.label}
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setOpen(true);
					}
				}}
			>
				Scanner <b>{selected.version}</b>
				<ChevronDown size={11} className="scan-model-chevron" />
			</button>
			{open && (
				<div
					id={menuId}
					className="scan-model-menu"
					role="menu"
					aria-label="Scanner version"
				>
					{scannerModels.map((model, index) => {
						const last = scannerModels.length - 1;
						return (
							<button
								key={model.id}
								ref={(element) => {
									options.current[index] = element;
								}}
								type="button"
								role="menuitemradio"
								aria-checked={value === model.id}
								tabIndex={-1}
								disabled={disabled}
								title={model.description}
								onClick={() => {
									onChange(model.id);
									setOpen(false);
									trigger.current?.focus();
								}}
								onKeyDown={(event) => {
									const next =
										event.key === "ArrowDown"
											? (index + 1) % (last + 1)
											: event.key === "ArrowUp"
												? (index + last) % (last + 1)
												: event.key === "Home"
													? 0
													: event.key === "End"
														? last
														: null;
									if (next !== null) {
										event.preventDefault();
										options.current[next]?.focus();
									}
								}}
							>
								<b>{model.version}</b>
								<span>{model.label}</span>
							</button>
						);
					})}
					{selected.enrich && (
						<div className="scan-model-modes">
							{scannerDataModes.map((item) => {
								const ModeIcon = MODE_ICONS[item.id];
								return (
									<button
										key={item.id}
										type="button"
										aria-pressed={mode === item.id}
										disabled={disabled}
										title={item.description}
										onClick={() => onModeChange(item.id)}
									>
										<ModeIcon size={12} aria-hidden="true" />
										{item.label}
									</button>
								);
							})}
						</div>
					)}
					{onScanShelf && (
						<button
							type="button"
							role="menuitem"
							className="scan-model-shelf"
							tabIndex={-1}
							disabled={disabled || mode === "offline"}
							title={
								mode === "offline"
									? "Needs Online mode: the AI reads the shelf photo"
									: "Photograph a whole shelf; we list the books and walk through them one at a time"
							}
							onClick={() => {
								setOpen(false);
								onScanShelf();
							}}
						>
							<Library size={14} aria-hidden="true" />
							<span>Scan full shelf</span>
						</button>
					)}
				</div>
			)}
		</fieldset>
	);
}
