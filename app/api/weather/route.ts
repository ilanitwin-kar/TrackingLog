import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type WeatherOut = {
  ok: boolean;
  tempC?: number;
  description?: string;
  isRain?: boolean;
  isHot?: boolean;
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** מינימום נדרש מתשובת OpenWeather — בלי `any` */
type OpenWeatherApiResponse = {
  main?: { temp?: number };
  weather?: Array<{
    id?: number;
    main?: string;
    description?: string;
  }>;
};

export async function GET(req: Request) {
  const key = process.env.OPENWEATHER_API_KEY?.trim() ?? "";
  if (!key) return NextResponse.json({ ok: false } satisfies WeatherOut);

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ ok: false } satisfies WeatherOut, { status: 400 });
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("lat", String(clamp(lat, -90, 90)));
  url.searchParams.set("lon", String(clamp(lon, -180, 180)));
  url.searchParams.set("appid", key);
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "he");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: false } satisfies WeatherOut);
    const data = (await res.json()) as OpenWeatherApiResponse;
    const tempC = clamp(Number(data?.main?.temp) || 0, -60, 80);
    const description = String(data?.weather?.[0]?.description ?? "").trim().slice(0, 80);
    const main = String(data?.weather?.[0]?.main ?? "").toLowerCase();
    const id = Number(data?.weather?.[0]?.id);
    const isRain = main.includes("rain") || (Number.isFinite(id) && id >= 500 && id < 600);
    const isHot = tempC >= 30;

    return NextResponse.json({
      ok: true,
      tempC: Math.round(tempC),
      description,
      isRain,
      isHot,
    } satisfies WeatherOut);
  } catch {
    return NextResponse.json({ ok: false } satisfies WeatherOut);
  }
}

