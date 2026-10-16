type TorchCapabilities = MediaTrackCapabilities & {
	torch?: boolean | boolean[];
};
type TorchSettings = MediaTrackSettings & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

export type CameraTorch = {
	readonly supported: boolean;
	readonly enabled: boolean;
	/** True when the requested state was applied and is still the latest request. */
	setEnabled: (enabled: boolean) => Promise<boolean>;
	dispose: () => void;
};

/** Controls only the existing video track; never acquires a camera or stream. */
export function createCameraTorch(track: MediaStreamTrack | null): CameraTorch {
	let capable = false;
	let enabled = false;
	let active = true;
	let revision = 0;
	let queue: Promise<unknown> = Promise.resolve();
	const live = () => track?.readyState === "live";
	const readEnabled = () => {
		try {
			const setting = (track?.getSettings?.() as TorchSettings | undefined)
				?.torch;
			if (typeof setting === "boolean") enabled = setting;
		} catch {
			// Some browsers expose capabilities but reject getSettings.
		}
		return enabled;
	};
	try {
		const torch = (track?.getCapabilities?.() as TorchCapabilities | undefined)
			?.torch;
		capable = torch === true || (Array.isArray(torch) && torch.includes(true));
	} catch {
		// Unsupported cameras retain the photo/capture flow without a torch.
	}
	readEnabled();
	const constraints = (next: boolean): MediaTrackConstraints => {
		const current = track?.getConstraints?.() ?? {};
		const { advanced = [], ...basic } = current;
		// Replace only torch constraints so an old advanced torch value cannot
		// conflict with the new one. Keep all camera resolution/facing settings.
		delete (basic as TorchConstraintSet).torch;
		const preserved = advanced
			.map((item) => {
				const value = { ...item } as TorchConstraintSet;
				delete value.torch;
				return value;
			})
			.filter((item) => Object.keys(item).length > 0);
		return {
			...basic,
			advanced: [...preserved, { torch: next } as TorchConstraintSet],
		};
	};
	return {
		get supported() {
			return active && capable && live();
		},
		get enabled() {
			return active && live() ? readEnabled() : false;
		},
		setEnabled(next) {
			const request = ++revision;
			const operation = queue.then(async () => {
				if (!active || !capable || !live() || request !== revision || !track)
					return false;
				try {
					await track.applyConstraints(constraints(next));
					if (!active || !live() || request !== revision) return false;
					enabled = next;
					return readEnabled() === next;
				} catch {
					return false;
				}
			});
			queue = operation;
			return operation;
		},
		dispose() {
			if (!active) return;
			active = false;
			revision++;
			// Serializing this after a pending enable guarantees that a camera
			// grant/constraint finishing late cannot leave this track's light on.
			if (capable || enabled) {
				queue = queue.then(async () => {
					if (!live() || !track) return;
					try {
						await track.applyConstraints(constraints(false));
					} catch {
						// Stopping the parent camera session also switches its torch off.
					}
				});
			}
			enabled = false;
		},
	};
}
