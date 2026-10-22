// Page helpers for tests/browser/shared-device.mjs (the /people route).
export const SECRET = "hello Ann from Ben";
export const DRAFT = "unsent draft for Ann";

export async function openPeople(page, origin, base) {
	await page.goto(`${origin}${base}people`);
	await page.getByTestId("active-person").waitFor({ timeout: 30_000 });
}

export const active = (page) => page.getByTestId("active-person").innerText();

/** Switches through the UI and waits until the new person's page has rendered. */
export async function switchTo(page, displayName) {
	await page.getByTestId("switch-person").selectOption({ label: displayName });
	await page.getByTestId("active-person").filter({ hasText: displayName }).waitFor();
	await page.getByTestId("visibility").waitFor();
}

export async function addPerson(page, name) {
	await page.getByTestId("new-person").fill(name);
	await page.getByTestId("add-person").click();
	await page.getByTestId("people-message").filter({ hasText: `Added ${name}` }).waitFor();
}

export async function turnOn(page, publicName) {
	await page.getByTestId("public-name").fill(publicName);
	await page.getByTestId("show").click();
	await page.getByTestId("visibility").filter({ hasText: publicName }).waitFor();
}

export const directoryNames = async (page) => {
	await page.getByTestId("directory").or(page.getByTestId("directory-empty")).waitFor();
	return (await page.getByTestId("directory-name").allInnerTexts()).sort();
};

export async function send(page, body) {
	await page.getByTestId("compose").fill(body);
	await page.getByTestId("send").click();
	await page.getByTestId("send-state").filter({ hasText: "Saved on this device" }).waitFor();
}

export const bodies = (page) => page.getByTestId("message-body").allInnerTexts();

/**
 * Records any DOM state where the secret message, or the draft, is visible while the active person
 * is not a participant (including the loading state, where no person is shown at all).
 */
export function watchForLeaks(page, members) {
	return page.evaluate(
		({ members, secret, draft }) => {
			window.__leaks = [];
			const check = () => {
				const who = document.querySelector('[data-testid="active-person"]')?.textContent ?? "(loading)";
				if (members.includes(who)) return;
				if (document.body.innerText.includes(secret)) window.__leaks.push(`message under ${who}`);
				for (const el of document.querySelectorAll("textarea, input"))
					if (el.value === draft) window.__leaks.push(`draft under ${who}`);
			};
			new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
		},
		{ members, secret: SECRET, draft: DRAFT },
	);
}

export const leaks = (page) => page.evaluate(() => window.__leaks ?? []);
