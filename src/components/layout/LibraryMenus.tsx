import {
	Check,
	ChevronDown,
	ChevronRight,
	Globe2,
	ImagePlus,
	Menu,
	Minus,
	SlidersHorizontal,
	Plus,
	Settings2,
	ShoppingBag,
	Tag,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { type FeatureFlag, useFeatureFlags } from "../../lib/featureFlags";
import { useShelfPlatesStore } from "../../stores/useShelfPlatesStore";
import { useTourStore } from "../../stores/useTourStore";
import LanguageFlag from "./LanguageFlag";
import { useReaderPreferences } from "../../stores/useReaderPreferences";
import { useLevelStore } from "../../stores/useLevelStore";
import { progressionConfig } from "../shelves/progressionConfig";
import { BOOKS_SHELF_LEVEL } from "../shelves/shelfBooks";
import "./library-menus.css";

const languages = [
	{ code: "DA", name: "Dansk" },
	{ code: "EN", name: "English" },
	{ code: "SV", name: "Svenska" },
	{ code: "NO", name: "Norsk" },
	{ code: "FI", name: "Suomi" },
	{ code: "IS", name: "Íslenska" },
	{ code: "FO", name: "Føroyskt" },
	{ code: "KL", name: "Kalaallisut" },
	{ code: "AX", name: "Åland · Svenska" },
] as const;
type Language = (typeof languages)[number]["code"];
const words = {
	FI: {
		pageCurl: "Sivun kaarevuus",
		controls: "Säätimet",
		levels: "Hyllytaso",
		less: "Pienennä hyllytasoa",
		more: "Suurenna hyllytasoa",
		shop: "Kauppa",
		signIn: "Kirjaudu sisään",
		menu: "Valikko",
		language: "Kieli",
		add: "Lisää kirja",
		plates: "Kultaiset hyllykyltit",
		settings: "Asetukset",
		flags: "Ominaisuudet",
		reset: "Palauta oletukset",
		close: "Sulje",
		demo: "Demon säätimet",
		helix: "DNA-navigointi",
		frame: "Kuvakehykset",
		captions: "Esittelyn tekstit",
		appearance: "Hylly ja navigointi",
		tour: "Demo ja esittely",
		unavailable:
			"Kirjautuminen ei ole vielä käytettävissä. Hyllysi tallennetaan tähän selaimeen.",
	},
	IS: {
		pageCurl: "Síðubeygja",
		controls: "Stýringar",
		levels: "Hillustig",
		less: "Lækka hillustig",
		more: "Hækka hillustig",
		shop: "Verslun",
		signIn: "Skrá inn",
		menu: "Valmynd",
		language: "Tungumál",
		add: "Bæta við bók",
		plates: "Gyllt hilluskilti",
		settings: "Stillingar",
		flags: "Eiginleikar",
		reset: "Endurheimta sjálfgefnar stillingar",
		close: "Loka",
		demo: "Sýningarstýringar",
		helix: "DNA-leiðsögn",
		frame: "Myndarammar",
		captions: "Kynningartextar",
		appearance: "Hilla og leiðsögn",
		tour: "Sýning og kynning",
		unavailable:
			"Innskráning er ekki enn í boði. Hillan þín er vistuð í þessum vafra.",
	},
	EN: {
		pageCurl: "Page curl",
		controls: "Controls",
		levels: "Shelf level",
		less: "Decrease shelf level",
		more: "Increase shelf level",
		shop: "Shop",
		signIn: "Sign in",
		menu: "Menu",
		language: "Language",
		add: "Add a book",
		plates: "Gold shelf plates",
		settings: "Settings",
		flags: "Features",
		reset: "Restore defaults",
		close: "Close",
		demo: "Demo controls",
		helix: "DNA navigation",
		frame: "Picture frames",
		captions: "Tour captions",
		appearance: "Shelf & navigation",
		tour: "Demo & tour",
		unavailable:
			"Sign-in is not available yet. Your shelf is saved in this browser.",
	},
	DA: {
		pageCurl: "Sidekrøl",
		controls: "Kontrol",
		levels: "Hyldeniveau",
		less: "Sænk hyldeniveau",
		more: "Hæv hyldeniveau",
		shop: "Butik",
		signIn: "Log ind",
		menu: "Menu",
		language: "Sprog",
		add: "Tilføj en bog",
		plates: "Gyldne hyldeskilte",
		settings: "Indstillinger",
		flags: "Funktioner",
		reset: "Gendan standard",
		close: "Luk",
		demo: "Demokontrol",
		helix: "DNA-navigation",
		frame: "Billedrammer",
		captions: "Turtekster",
		appearance: "Hylde og navigation",
		tour: "Demo og tur",
		unavailable:
			"Login er ikke tilgængeligt endnu. Din hylde gemmes i denne browser.",
	},
	DE: {
		pageCurl: "Seitenwölbung",
		controls: "Steuerung",
		levels: "Regalstufe",
		less: "Regalstufe verringern",
		more: "Regalstufe erhöhen",
		shop: "Shop",
		signIn: "Anmelden",
		menu: "Menü",
		language: "Sprache",
		add: "Buch hinzufügen",
		plates: "Goldene Regalschilder",
		settings: "Einstellungen",
		flags: "Funktionen",
		reset: "Standard wiederherstellen",
		close: "Schließen",
		demo: "Demo-Steuerung",
		helix: "DNA-Navigation",
		frame: "Bilderrahmen",
		captions: "Tourtexte",
		appearance: "Regal und Navigation",
		tour: "Demo und Tour",
		unavailable:
			"Die Anmeldung ist noch nicht verfügbar. Dein Regal wird in diesem Browser gespeichert.",
	},
	SV: {
		pageCurl: "Sidkrökning",
		controls: "Kontroller",
		levels: "Hyllnivå",
		less: "Minska hyllnivån",
		more: "Öka hyllnivån",
		shop: "Butik",
		signIn: "Logga in",
		menu: "Meny",
		language: "Språk",
		add: "Lägg till en bok",
		plates: "Gyllene hyllskyltar",
		settings: "Inställningar",
		flags: "Funktioner",
		reset: "Återställ standard",
		close: "Stäng",
		demo: "Demokontroller",
		helix: "DNA-navigering",
		frame: "Bildramar",
		captions: "Turtexter",
		appearance: "Hylla och navigering",
		tour: "Demo och tur",
		unavailable:
			"Inloggning är inte tillgänglig ännu. Din hylla sparas i den här webbläsaren.",
	},
	NO: {
		pageCurl: "Sidekrøll",
		controls: "Kontroller",
		levels: "Hyllenivå",
		less: "Senk hyllenivå",
		more: "Øk hyllenivå",
		shop: "Butikk",
		signIn: "Logg inn",
		menu: "Meny",
		language: "Språk",
		add: "Legg til en bok",
		plates: "Gylne hylleskilt",
		settings: "Innstillinger",
		flags: "Funksjoner",
		reset: "Gjenopprett standard",
		close: "Lukk",
		demo: "Demokontroller",
		helix: "DNA-navigasjon",
		frame: "Bilderammer",
		captions: "Turtekster",
		appearance: "Hylle og navigasjon",
		tour: "Demo og tur",
		unavailable:
			"Innlogging er ikke tilgjengelig ennå. Hyllen din lagres i denne nettleseren.",
	},
};
function savedLanguage(): Language {
	try {
		const value = localStorage.getItem("boooks-nav-language");
		return languages.find((item) => item.code === value)?.code ?? "EN";
	} catch {
		return "EN";
	}
}

export default function LibraryMenus({
	onAddBook,
	showActions,
	scanning,
}: {
	onAddBook: () => void;
	showActions: boolean;
	scanning: boolean;
}) {
	const [language, setLanguage] = useState<Language>(savedLanguage);
	const [panel, setPanel] = useState<"main" | "language" | "signin" | null>(
		null,
	);
	const panelRef = useRef<HTMLDivElement>(null);
	const opener = useRef<HTMLButtonElement | null>(null);
	const flags = useFeatureFlags();
	const pictureFrameVisible = useShelfControlsStore(
		(state) => state.pictureFrameVisible,
	);
	const t =
		words[
			language === "AX"
				? "SV"
				: language === "FO" || language === "KL"
					? "EN"
					: language
		];
	const pageCurl = useReaderPreferences((state) => state.pageCurl);
	const libraryLevel = useLevelStore((state) => state.libraryLevel);
	const demoLevel = useLevelStore((state) => state.levelIndex);
	const stage = useTourStore((state) => state.stage);
	const isGrowth = stage === "grow";
	const shelfLevel = isGrowth ? demoLevel : libraryLevel;
	const minimumLevel = isGrowth ? 0 : BOOKS_SHELF_LEVEL;
	const maximumLevel = progressionConfig.levels.length - 1;
	const stepShelfLevel = (step: number) => {
		useTourStore.setState({ paused: true });
		const level = Math.max(
			minimumLevel,
			Math.min(maximumLevel, shelfLevel + step),
		);
		if (isGrowth) useLevelStore.getState().startDemo(level, false);
		else useLevelStore.getState().setLibraryLevel(level);
	};
	const close = () => {
		setPanel(null);
		opener.current?.focus();
	};
	useEffect(() => {
		panelRef.current?.querySelector<HTMLElement>("button, summary, a")?.focus();
	}, [panel]);
	useEffect(() => {
		setPanel(null);
	}, [scanning]);
	const open = (next: typeof panel, button: HTMLButtonElement) => {
		opener.current = button;
		setPanel(panel === next ? null : next);
	};
	const chooseLanguage = (code: Language) => {
		setLanguage(code);
		try {
			localStorage.setItem("boooks-nav-language", code);
		} catch {
			/* Keep the choice for this visit. */
		}
		close();
	};
	const addBook = () => {
		setPanel(null);
		onAddBook();
	};
	const plates = () => {
		setPanel(null);
		useShelfPlatesStore.getState().openEditor();
	};
	const toggleFlag = (flag: FeatureFlag) => {
		const enabled = !flags[flag];
		flags.setFlag(flag, enabled);
		if (flag === "SHOW_DEMO_UI" && !enabled) {
			useTourStore.getState().enter("library");
			useTourStore.setState({ paused: true });
		}
	};
	const toggle = (flag: FeatureFlag, label: string) => (
		<button
			type="button"
			className="nav-toggle-row"
			role="switch"
			aria-checked={flags[flag]}
			onClick={() => toggleFlag(flag)}
		>
			<span>{label}</span>
			<span className="nav-ios-switch" aria-hidden="true">
				<span />
			</span>
		</button>
	);
	return (
		<div
			className="library-navigation"
			onKeyDown={(event) => {
				if (panel) {
					event.stopPropagation();
					if (event.key === "Escape") {
						event.preventDefault();
						close();
					}
				}
			}}
		>
			{panel && (
				<button
					className="nav-scrim"
					tabIndex={-1}
					aria-label={t.close}
					onClick={close}
				/>
			)}
			<nav className="library-top-nav" aria-label="Main navigation">
				<button
					type="button"
					className="nav-language-pill"
					aria-label={t.language}
					aria-expanded={panel === "language"}
					aria-controls="boooks-nav-panel"
					onClick={(event) => open("language", event.currentTarget)}
				>
					<Globe2 size={19} />
					<span>{language}</span>
					<ChevronDown
						size={16}
						className={panel === "language" ? "nav-chevron-open" : ""}
					/>
				</button>
				<button
					type="button"
					className="nav-signin"
					onClick={(event) => open("signin", event.currentTarget)}
				>
					{t.signIn}
				</button>
				<button
					type="button"
					className="nav-menu-button"
					aria-label={t.menu}
					aria-expanded={panel === "main"}
					aria-controls="boooks-nav-panel"
					onClick={(event) => open("main", event.currentTarget)}
				>
					{panel === "main" ? <X size={22} /> : <Menu size={22} />}
				</button>
			</nav>
			{panel && (
				<div
					ref={panelRef}
					id="boooks-nav-panel"
					className={`nav-overlay nav-overlay-${panel}`}
					role="region"
					aria-label={panel === "language" ? t.language : t.menu}
				>
					{panel === "language" &&
						languages.map((item) => (
							<button
								key={item.code}
								type="button"
								className="nav-language-row"
								aria-pressed={item.code === language}
								onClick={() => chooseLanguage(item.code)}
							>
								<span className="nav-language-badge">
									<LanguageFlag language={item.code} />
								</span>
								<span>{item.name}</span>
								{item.code === language && (
									<Check size={23} className="nav-check" />
								)}
							</button>
						))}
					{panel === "main" && (
						<>
							<div className="nav-panel-heading">
								<span>{t.menu}</span>
								<Settings2 size={18} />
							</div>
							{showActions && (
								<>
									<button
										type="button"
										className="nav-action-row"
										onClick={addBook}
									>
										<Plus size={20} />
										{t.add}
									</button>
									<details className="nav-submenu" open>
										<summary>
											<ShoppingBag size={19} />
											{t.shop}
											<ChevronRight size={17} />
										</summary>
										<button
											type="button"
											className="nav-action-row"
											onClick={plates}
										>
											<Tag size={20} className="nav-gold" />
											{t.plates}
										</button>
										<button
											type="button"
											className="nav-action-row"
											aria-pressed={pictureFrameVisible}
											onClick={() => {
												useShelfControlsStore.getState().togglePictureFrame();
												close();
											}}
										>
											<ImagePlus size={20} />
											{t.frame}
											{pictureFrameVisible && (
												<Check size={18} className="nav-check" />
											)}
										</button>
									</details>
								</>
							)}
							<details className="nav-submenu" open>
								<summary>
									<Settings2 size={19} />
									{t.settings}
									<ChevronRight size={17} />
								</summary>
								<details className="nav-submenu nav-submenu-inner" open>
									<summary>
										<SlidersHorizontal size={18} />
										{t.controls}
										<ChevronRight size={17} />
									</summary>
									<button
										type="button"
										className="nav-toggle-row"
										role="switch"
										aria-checked={pageCurl}
										onClick={() =>
											useReaderPreferences.getState().setPageCurl(!pageCurl)
										}
									>
										<span>{t.pageCurl}</span>
										<span className="nav-ios-switch" aria-hidden="true">
											<span />
										</span>
									</button>
									<div className="nav-stepper-row">
										<span id="shelf-level-label">{t.levels}</span>
										<div
											className="nav-stepper"
											role="group"
											aria-labelledby="shelf-level-label"
										>
											<button
												type="button"
												aria-label={t.less}
												disabled={shelfLevel <= minimumLevel}
												onClick={() => stepShelfLevel(-1)}
											>
												<Minus size={18} />
											</button>
											<output aria-live="polite" aria-atomic="true">
												{shelfLevel}
												<span> / {maximumLevel}</span>
											</output>
											<button
												type="button"
												aria-label={t.more}
												disabled={shelfLevel >= maximumLevel}
												onClick={() => stepShelfLevel(1)}
											>
												<Plus size={18} />
											</button>
										</div>
									</div>
								</details>
								<details className="nav-submenu nav-submenu-inner">
									<summary>
										{t.flags}
										<ChevronRight size={17} />
									</summary>
									<div className="nav-flag-group">
										<p>{t.appearance}</p>
										{toggle("SHOW_HELIX_NAV", t.helix)}
										{toggle("INSTANCED_SHELF", "Instanced shelf (fast)")}
										{toggle("FAST_BLUR", "Fast blur (new)")}
									</div>
									<div className="nav-flag-group">
										<p>{t.tour}</p>
										{toggle("SHOW_DEMO_UI", t.demo)}
										{toggle("SHOW_TOUR_TEXT", t.captions)}
									</div>
									<button
										type="button"
										className="nav-reset"
										onClick={() => {
											flags.reset();
											if (!useFeatureFlags.getState().SHOW_DEMO_UI) {
												useTourStore.getState().enter("library");
												useTourStore.setState({ paused: true });
											}
										}}
									>
										{t.reset}
									</button>
								</details>
								<button
									type="button"
									className="nav-action-row"
									onClick={() => setPanel("language")}
								>
									<Globe2 size={19} />
									{t.language}
									<span className="nav-end-label">{language}</span>
									<ChevronRight size={16} />
								</button>
							</details>
						</>
					)}
					{panel === "signin" && (
						<>
							<div className="nav-panel-heading">{t.signIn}</div>
							<p className="nav-message">{t.unavailable}</p>
							<button type="button" className="nav-action-row" onClick={close}>
								{t.close}
							</button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
