export type TimeOfDaySlot = {
  salutationHe: string;
  emoji: string;
};

/** 05–12 בוקר, 12–18 צהריים, 18–22 ערב, 22–05 לילה */
export function getTimeOfDaySlot(hour: number): TimeOfDaySlot {
  if (hour >= 5 && hour < 12) {
    return { salutationHe: "בוקר טוב", emoji: "☀️" };
  }
  if (hour >= 12 && hour < 18) {
    return { salutationHe: "צהריים טובים", emoji: "✨" };
  }
  if (hour >= 18 && hour < 22) {
    return { salutationHe: "ערב טוב", emoji: "🌙" };
  }
  return { salutationHe: "לילה טוב", emoji: "🌟" };
}

export type DashboardWeather = {
  tempC: number;
  description: string;
  isRain: boolean;
  isHot: boolean;
  /** true אם לפי העונה/שעה זה יום, false אם לילה */
  isDay?: boolean;
};

export type DashboardTip = {
  text: string;
};

function pickWeatherTip(hour: number, w: DashboardWeather): DashboardTip | null {
  // No “close journal” tip before 20:00 (per product requirement).
  if (w.isRain) {
    return { text: "גשום — משהו חם בבית (תה/מרק) עוזר להישאר במסלול." };
  }
  if (w.isHot || w.tempC >= 30) {
    return { text: "חם היום — מים + ארוחות קלילות יעשו לך חיים קלים יותר." };
  }
  if (w.tempC <= 14) {
    return { text: "קריר — מרק/תבשיל יכול לסגור פינה בלי תחושת “דיאטה”." };
  }
  if (hour >= 20) {
    return { text: "ערב טוב — אם עוד לא סגרת יום ביומן, שתי דקות וסיימנו." };
  }
  return { text: "נעים בחוץ — הליכה קצרה אחרי אוכל יכולה להרים את היום." };
}

function readWeatherCache(): DashboardWeather | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("cj_weather_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; data?: Record<string, unknown> };
    const d = (parsed?.data ?? {}) as Record<string, unknown>;
    const tempC = Number(d.tempC);
    if (!Number.isFinite(tempC)) return null;
    const description = String(d.description ?? "").trim();
    const isRain = Boolean(d.isRain);
    const isHot = Boolean(d.isHot);
    const now = Date.now();
    const ts = Number(parsed?.ts ?? 0);
    // cache freshness: 3 hours
    if (Number.isFinite(ts) && ts > 0 && now - ts > 3 * 60 * 60 * 1000) return null;
    return { tempC: Math.round(tempC), description, isRain, isHot };
  } catch {
    return null;
  }
}

function isLikelyDayBySeason(hour: number, month: number): boolean {
  // fallback heuristic for Israel: longer days in summer
  const isSummer = month >= 4 && month <= 9; // May–Oct
  const dayEnd = isSummer ? 20 : 18;
  const dayStart = 6;
  return hour >= dayStart && hour < dayEnd;
}

export function buildDashboardGreetingLine(
  firstName: string,
  hour: number
): string {
  const slot = getTimeOfDaySlot(hour);
  const name = firstName.trim();
  return name
    ? `${slot.salutationHe} ${name} ${slot.emoji}`
    : `${slot.salutationHe} ${slot.emoji}`;
}

export function buildDashboardGreetingRich(
  firstName: string,
  now: Date = new Date()
): { title: string; subtitle: string | null; tip: string | null; emoji: string } {
  const hour = now.getHours();
  const slot = getTimeOfDaySlot(hour);
  const name = firstName.trim();
  const weather = readWeatherCache();
  const isDay = weather?.isDay ?? isLikelyDayBySeason(hour, now.getMonth() + 1);
  const emoji = weather?.isRain ? "🌧️" : isDay ? "☀️" : "🌙";

  const title = name ? `${slot.salutationHe} ${name} ${emoji}` : `${slot.salutationHe} ${emoji}`;
  if (!weather) return { title, subtitle: null, tip: null, emoji };
  const desc = weather.description ? ` · ${weather.description}` : "";
  const hot = weather.isHot ? " · חם" : "";
  const subtitle = `${weather.tempC}°${desc}${hot}`.trim();
  const tip = pickWeatherTip(hour, weather)?.text ?? null;
  return { title, subtitle, tip, emoji };
}
