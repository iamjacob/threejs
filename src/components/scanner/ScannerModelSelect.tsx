import {
	Check,
	ChevronDown,
	Crop,
	Globe,
	Library,
	Lock,
	ScanLine,
	Sparkles,
	WifiOff,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
	type ScannerDataMode,
	type ScannerModel,
	scannerDataModes,
	scannerModels,
} from "./scannerModels";

const MODEL_ICONS = {
	manual: Crop,
	corners: ScanLine,
	enrich: Sparkles,
} as const;
const MODE_ICONS = { online: Globe, offline: WifiOff, private: Lock } as const;

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
	/** Optional: offer "Scan full shelf" under the models. */
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
	const selectedMode =
		scannerDataModes.find((item) => item.id === mode) ?? scannerDataModes[0];
	const Icon = MODEL_ICONS[value];
	const ModeIcon = MODE_ICONS[mode];

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
			aria-label="Scanner selection"
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
				aria-label={`Scanner model: ${selected.name}, ${selected.label}`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				disabled={disabled}
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setOpen(true);
					}
				}}
			>
				<span className="scan-model-icon">
					<Icon size={19} />
				</span>
				<span className="scan-model-current">
					<span className="scan-model-caption">Scanner model</span>
					<span>
						{selected.name}
						<span className="scan-model-divider">·</span>
						{selected.enrich ? (
							<>
								<ModeIcon size={11} aria-hidden="true" /> {selectedMode.label}
							</>
						) : (
							selected.label
						)}
					</span>
				</span>
				<ChevronDown size={15} className="scan-model-chevron" />
			</button>
			{open && (
				<div
					id={menuId}
					className="scan-model-menu"
					role="menu"
					aria-label="Scanner model"
				>
					<div className="scan-model-menu-title">Choose your scanner</div>
					{scannerModels.map((model, index) => {
						const OptionIcon = MODEL_ICONS[model.id];
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
								onClick={() => {
									onChange(model.id);
									setOpen(false);
									trigger.current?.focus();
								}}
								onKeyDown={(event) => {
									const last = scannerModels.length - 1;
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
								<span className="scan-model-icon">
									<OptionIcon size={19} />
								</span>
								<span className="scan-model-option-copy">
									<span className="scan-model-option-title">
										{model.name}
										<span className="scan-model-badge">{model.label}</span>
									</span>
									<span className="scan-model-description">
										{model.description}
									</span>
								</span>
								{value === model.id && (
									<Check className="scan-model-check" size={16} />
								)}
							</button>
						);
					})}
					<div className="scan-model-menu-title scan-model-menu-title-mode">
						Book details
					</div>
					<div className="scan-model-modes">
						{scannerDataModes.map((item) => {
							const OptionIcon = MODE_ICONS[item.id];
							const locked = !selected.enrich;
							return (
								<button
									key={item.id}
									type="button"
									aria-pressed={mode === item.id}
									disabled={disabled || locked}
									title={
										locked
											? `Switch to Gutenberg 0.3 to look up details`
											: item.description
									}
									onClick={() => onModeChange(item.id)}
								>
									<OptionIcon size={14} aria-hidden="true" />
									<span>{item.label}</span>
								</button>
							);
						})}
					</div>
					<p className="scan-model-mode-note">
						{selected.enrich
							? selectedMode.description
							: "Gutenberg 0.3 adds details, size and page count."}
					</p>
					{onScanShelf && (
						<>
							<div className="scan-model-menu-title scan-model-menu-title-mode">
								Many books
							</div>
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
								<span className="scan-model-icon">
									<Library size={19} />
								</span>
								<span className="scan-model-option-copy">
									<span className="scan-model-option-title">
										Scan full shelf
										<span className="scan-model-badge">beta</span>
									</span>
									<span className="scan-model-description">
										One photo of the shelf. The AI lists every book; you confirm
										them one by one.
									</span>
								</span>
							</button>
						</>
					)}
				</div>
			)}
		</fieldset>
	);
}
