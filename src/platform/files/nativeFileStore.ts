import { Directory, Filesystem } from "@capacitor/filesystem";
import { assertBlobKey, type FileStore } from "./fileStore";

const ROOT = "boooks-blobs";

/**
 * Native blobs as files under Directory.Data (app-private, not user-visible, backed up per OS
 * rules). The plugin moves bytes as base64 strings over the bridge on native; that's fine for
 * images ≤ 10 MB (FILE_MAX_BYTES) but not for video. NOT verified on a device in this branch.
 */
export function createNativeFileStore(): FileStore {
	// Two-level fan-out (ab/abcdef…) keeps directories small.
	const pathFor = (key: string) => {
		assertBlobKey(key);
		return `${ROOT}/${key.slice(0, 2)}/${key}`;
	};
	return {
		name: "capacitor-filesystem",
		async put(key, bytes) {
			const path = pathFor(key);
			if (await exists(path)) return;
			await Filesystem.writeFile({
				path,
				data: toBase64(bytes),
				directory: Directory.Data,
				recursive: true,
			});
		},
		async get(key) {
			const path = pathFor(key);
			if (!(await exists(path))) return undefined;
			const { data } = await Filesystem.readFile({
				path,
				directory: Directory.Data,
			});
			return typeof data === "string"
				? fromBase64(data)
				: new Uint8Array(await data.arrayBuffer());
		},
		async has(key) {
			return exists(pathFor(key));
		},
		async delete(key) {
			const path = pathFor(key);
			if (await exists(path))
				await Filesystem.deleteFile({ path, directory: Directory.Data });
		},
	};
}

async function exists(path: string) {
	try {
		await Filesystem.stat({ path, directory: Directory.Data });
		return true;
	} catch {
		return false;
	}
}

export function toBase64(bytes: Uint8Array) {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

export function fromBase64(base64: string) {
	const binary = atob(base64.replace(/^data:[^,]*,/, ""));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
