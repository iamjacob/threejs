import { create } from "zustand";

function savedPageCurl() {
	try {
		return localStorage.getItem("boooks-page-curl") !== "false";
	} catch {
		return true;
	}
}

export const useReaderPreferences = create<{
	pageCurl: boolean;
	setPageCurl: (enabled: boolean) => void;
}>((set) => ({
	pageCurl: savedPageCurl(),
	setPageCurl: (pageCurl) => {
		set({ pageCurl });
		try {
			localStorage.setItem("boooks-page-curl", String(pageCurl));
		} catch {
			/* Keep the preference for this session. */
		}
	},
}));
