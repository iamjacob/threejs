import { Check, ChevronDown, Crop, ScanLine } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { type ScannerModel, scannerModels } from "./scannerModels";

export default function ScannerModelSelect({
	value,
	onChange,
	disabled,
}: {
	value: ScannerModel;
	onChange: (model: ScannerModel) => void;
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const host = useRef<HTMLFieldSetElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const options = useRef<(HTMLButtonElement | null)[]>([]);
	const menuId = useId();
	const selected =
		scannerModels.find((model) => model.id === value) ?? scannerModels[0];
	const Icon = value === "corners" ? ScanLine : Crop;

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
						{selected.label}
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
						const OptionIcon = model.id === "corners" ? ScanLine : Crop;
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
				</div>
			)}
		</fieldset>
	);
}
