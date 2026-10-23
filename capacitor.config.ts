import type { CapacitorConfig } from "@capacitor/cli";

// Native shell for the same app. Build the web bundle with `npm run build:native` (base "/",
// no service worker) before `cap sync`; `npm run cap:sync` does both.
const config: CapacitorConfig = {
	appId: "me.jacobg.boooks",
	appName: "Boooks",
	webDir: "dist-native",
	plugins: {
		CapacitorSQLite: {
			// Plain SQLite for now; SQLCipher encryption is a separate decision (key management).
			iosIsEncryption: false,
			androidIsEncryption: false,
			iosDatabaseLocation: "Library/CapacitorDatabase",
		},
	},
};

export default config;
