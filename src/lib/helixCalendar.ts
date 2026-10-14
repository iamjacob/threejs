export const DAY_MS = 86_400_000;
export const HELIX_PIXELS_PER_DAY = 2.2;
export const CALENDAR_UNITS = [365, 91, 30.4, 7, 1, 1 / 24, 1 / 96, 1 / 1440, 1 / 86400];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SEASONS: Record<number, string> = { 2: "Spring", 5: "Summer", 8: "Autumn", 11: "Winter" };
const HEIGHTS = [28, 23, 18, 13, 9, 7, 5, 4, 3];
const LABEL_SPACING = [0, 58, 30, 34, 40, 34, 34, 36, 24];
const pad = (number: number) => String(number).padStart(2, "0");
const dateAt = (day: number) => new Date(Math.round(day * DAY_MS));

export function readDateDay(value: string | undefined): number | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) return null;
	const time = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
	if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
	return time / DAY_MS;
}

// Older local scans can be placed on the current day until their metadata is migrated.
export function helixReadDay(book: { readDate?: string }, today = Math.floor(Date.now() / DAY_MS)) {
	return readDateDay(book.readDate) ?? today;
}

/** One shared annual palette for the ribbons, ticks, seasons and selection marker. */
export function calendarHue(day: number) {
	const year = dateAt(day).getUTCFullYear();
	const start = Date.UTC(year, 0, 1) / DAY_MS;
	const end = Date.UTC(year + 1, 0, 1) / DAY_MS;
	return (day - start) / (end - start);
}

export function readCountsByYear(books: { readDate?: string }[]) {
	const counts = new Map<number, number>();
	for (const book of books) {
		const year = dateAt(helixReadDay(book)).getUTCFullYear();
		counts.set(year, (counts.get(year) ?? 0) + 1);
	}
	return counts;
}

export type CalendarTick = { day: number; x: number; level: number; label: string; alpha: number; height: number; width: number; showLabel: boolean };

function isoWeek(date: Date) {
	const copy = new Date(date);
	copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
	return Math.ceil(((copy.getTime() - Date.UTC(copy.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7);
}

/** The reference's calendar hierarchy: year, season, month, week, day, hour, minute, second. */
export function calendarTicks(center: number, pixelsPerDay: number, width: number): CalendarTick[] {
	if (![center, pixelsPerDay, width].every(Number.isFinite) || pixelsPerDay <= 0 || width <= 0) return [];
	const ppd = Math.max(0.12, Math.min(6e6, pixelsPerDay));
	const from = center - (width / 2 + 50) / ppd;
	const to = center + (width / 2 + 50) / ppd;
	const spacing = CALENDAR_UNITS.map(unit => unit * ppd);
	const opacity = spacing.map((value, index) => {
		if (index <= 1) return 1;
		const t = Math.max(0, Math.min(1, (value - 2.5) / 4.5));
		return t * t * (3 - 2 * t);
	});
	const ticks: CalendarTick[] = [];
	const add = (day: number, level: number, label: string) => {
		if (day < from || day > to || !opacity[level]) return;
		ticks.push({ day, level, label, x: width / 2 + (day - center) * ppd,
			alpha: opacity[level], height: HEIGHTS[level] * (level < 2 ? 1 : 0.5 + 0.5 * opacity[level]),
			width: level === 0 ? 1.5 : 1, showLabel: spacing[level] >= LABEL_SPACING[level] * 10 / 9.5 });
	};
	for (let year = dateAt(from).getUTCFullYear(); year <= dateAt(to).getUTCFullYear(); year++) {
		for (let month = 0; month < 12; month++) {
			const day = Date.UTC(year, month, 1) / DAY_MS;
			add(day, month === 0 ? 0 : SEASONS[month] ? 1 : 2, month === 0 ? String(year) : SEASONS[month] ?? MONTHS[month]);
		}
	}
	if (opacity[3]) for (let day = Math.ceil(from); day <= to; day++) {
		const date = dateAt(day);
		if (date.getUTCDate() === 1) continue;
		if (date.getUTCDay() === 1) add(day, 3, `W${isoWeek(date)}`);
		else add(day, 4, `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}`);
	}
	const fine = (level: number, perDay: number, skip: number, label: (value: number) => string) => {
		if (!opacity[level]) return;
		for (let value = Math.ceil(from * perDay); value <= to * perDay; value++) {
			if (value % skip !== 0) add(value / perDay, level, label(value));
		}
	};
	fine(5, 24, 24, value => `${pad(((value % 24) + 24) % 24)}:00`);
	fine(6, 96, 4, value => { const minute = ((value % 96) + 96) % 96; return `${pad(Math.floor(minute / 4))}:${pad(minute % 4 * 15)}`; });
	fine(7, 1440, 15, value => { const minute = ((value % 1440) + 1440) % 1440; return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`; });
	fine(8, 86400, 60, value => `:${pad(((value % 60) + 60) % 60)}`);
	return ticks;
}

export function calendarLabels(ticks: CalendarTick[], measure: (text: string, strong: boolean) => number) {
	const occupied: [number, number][] = [];
	return [...ticks].sort((a, b) => a.level - b.level).flatMap(tick => {
		if (!tick.showLabel) return [];
		const strong = tick.level === 0 || tick.level === 4 || tick.level === 5;
		const width = measure(tick.label, strong);
		const free = (x: number) => !occupied.some(([left, right]) => x - width / 2 - 4 < right && x + width / 2 + 4 > left);
		let x = tick.x;
		if (!free(x)) {
			if (tick.level !== 1) return [];
			const hit = occupied.find(([left, right]) => x - width / 2 - 4 < right && x + width / 2 + 4 > left);
			if (!hit) return [];
			const alternatives = [hit[0] - width / 2 - 4, hit[1] + width / 2 + 4].filter(value => Math.abs(value - x) <= width + 10 && free(value)).sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
			if (!alternatives.length) return [];
			x = alternatives[0];
		}
		occupied.push([x - width / 2 - 4, x + width / 2 + 4]);
		return [{ ...tick, x, strong, labelWidth: width }];
	});
}
