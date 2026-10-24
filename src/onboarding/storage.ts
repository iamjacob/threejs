/**
 * Seen-once flag and the reader profile collected during onboarding.
 * Progress is intentionally not stored: a reload always starts at the intro.
 */

export const SEEN_KEY = "boooks-onboarding-seen";
export const PROFILE_KEY = "boooks-onboarding-profile";

/** Placeholder until a soundtrack is added. A missing file leaves scroll in charge. */
export const ONBOARDING_TRACK_PATH = "/audio/onboarding-theme.mp3";

export type OnboardingProfile = {
	bookTitle: string;
	rhythm: string;
	identity: string;
	createdAt: string;
};

export function onboardingSeen() {
	try {
		return localStorage.getItem(SEEN_KEY) === "1";
	} catch {
		// Storage disabled: don't trap the reader on the intro.
		return true;
	}
}

export function markOnboardingSeen() {
	try {
		localStorage.setItem(SEEN_KEY, "1");
	} catch {
		/* The navigation still proceeds. */
	}
}

export function saveOnboardingProfile(profile: OnboardingProfile) {
	try {
		localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
	} catch {
		/* The visit still counts. */
	}
	markOnboardingSeen();
}

export function readOnboardingProfile(): OnboardingProfile | null {
	try {
		const raw = localStorage.getItem(PROFILE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const record = parsed as Partial<OnboardingProfile>;
		return {
			bookTitle: typeof record.bookTitle === "string" ? record.bookTitle : "",
			rhythm: typeof record.rhythm === "string" ? record.rhythm : "",
			identity: typeof record.identity === "string" ? record.identity : "",
			createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
		};
	} catch {
		return null;
	}
}
