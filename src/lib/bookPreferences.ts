export const BLURRED_BOOKS_KEY = "boooks-blurred-books-v1";
export const REMOVED_BOOKS_KEY = "boooks-removed-books-v1";

export function readBookIds(key: string): string[] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
		return Array.isArray(value)
			? [...new Set(value.filter((id): id is string => typeof id === "string"))]
			: [];
	} catch {
		return [];
	}
}

export function saveBookIds(key: string, ids: string[]) {
	try {
		localStorage.setItem(key, JSON.stringify(ids));
	} catch {
		// Keep the editor usable when browser storage is unavailable.
	}
}
