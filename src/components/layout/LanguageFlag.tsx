export default function LanguageFlag({
	language,
}: {
	language: "DA" | "EN" | "DE" | "SV" | "NO" | "FI" | "IS" | "FO" | "KL" | "AX";
}) {
	return (
		<svg
			className="nav-language-flag"
			viewBox="0 0 30 20"
			fill="none"
			aria-hidden="true"
			focusable="false"
		>
			{language === "KL" ? (
				<>
					<path fill="#fff" d="M0 0h30v10H0z" />
					<path fill="#d00c33" d="M0 10h30v10H0z" />
					<path fill="#d00c33" d="M4 10a6 6 0 0 1 12 0Z" />
					<path fill="#fff" d="M4 10a6 6 0 0 0 12 0Z" />
				</>
			) : language === "FO" || language === "AX" ? (
				<>
					<path
						fill={language === "FO" ? "#fff" : "#0053a5"}
						d="M0 0h30v20H0z"
					/>
					<path
						stroke={language === "FO" ? "#0065bd" : "#ffce00"}
						strokeWidth="6"
						d="M10 0v20M0 10h30"
					/>
					<path
						stroke={language === "FO" ? "#ed2939" : "#d21034"}
						strokeWidth="3"
						d="M10 0v20M0 10h30"
					/>
				</>
			) : language === "DE" ? (
				<>
					<path fill="#171717" d="M0 0h30v7H0z" />
					<path fill="#d72828" d="M0 7h30v6H0z" />
					<path fill="#ffce00" d="M0 13h30v7H0z" />
				</>
			) : language === "EN" ? (
				<>
					<path fill="#012169" d="M0 0h30v20H0z" />
					<path stroke="#fff" strokeWidth="5" d="m0 0 30 20M30 0 0 20" />
					<path
						fill="#c8102e"
						d="m0 0 13 8.67H10L0 2zm30 0L17 8.67h3L30 2zM0 20l13-8.67h-3L0 18zm30 0L17 11.33h3L30 18z"
					/>
					<path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30" />
					<path stroke="#c8102e" strokeWidth="4" d="M15 0v20M0 10h30" />
				</>
			) : language === "FI" ? (
				<>
					<path fill="#fff" d="M0 0h30v20H0z" />
					<path stroke="#003580" strokeWidth="5" d="M10 0v20M0 10h30" />
				</>
			) : language === "IS" ? (
				<>
					<path fill="#02529c" d="M0 0h30v20H0z" />
					<path stroke="#fff" strokeWidth="6" d="M10 0v20M0 10h30" />
					<path stroke="#dc1e35" strokeWidth="3" d="M10 0v20M0 10h30" />
				</>
			) : (
				<>
					<path
						fill={
							language === "SV"
								? "#006aa7"
								: language === "DA"
									? "#c8102e"
									: "#ba0c2f"
						}
						d="M0 0h30v20H0z"
					/>
					<path
						stroke={language === "SV" ? "#fecc00" : "#fff"}
						strokeWidth={language === "NO" ? 6 : 3}
						d="M10 0v20M0 10h30"
					/>
					{language === "NO" && (
						<path stroke="#00205b" strokeWidth="3" d="M10 0v20M0 10h30" />
					)}
				</>
			)}
		</svg>
	);
}
