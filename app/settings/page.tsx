"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { gf } from "@/lib/hebrewGenderUi";
import { loadProfile } from "@/lib/storage";
import { loadSoundEffectsEnabled, saveSoundEffectsEnabled } from "@/lib/soundSettings";

type WeatherCache = { ts: number; data: { tempC: number; description: string; isRain: boolean; isHot: boolean } };

export default function SettingsPage() {
  const gender = loadProfile().gender;
  const [soundsOn, setSoundsOn] = useState(true);
  const [weather, setWeather] = useState<null | WeatherCache["data"]>(null);

  useEffect(() => {
    setSoundsOn(loadSoundEffectsEnabled());
    try {
      const raw = localStorage.getItem("cj_weather_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as WeatherCache;
      if (!parsed?.data) return;
      setWeather(parsed.data);
    } catch {
      /* ignore */
    }
  }, []);

  async function enableWeather() {
    if (!("geolocation" in navigator)) {
      window.alert(gf(gender, "אין גישה למיקום במכשיר הזה.", "אין גישה למיקום במכשיר הזה."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const res = await fetch(`/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
          const data = (await res.json()) as { ok?: boolean; tempC?: number; description?: string; isRain?: boolean; isHot?: boolean };
          if (!data?.ok || typeof data.tempC !== "number") return;
          const next = {
            tempC: data.tempC,
            description: String(data.description ?? ""),
            isRain: Boolean(data.isRain),
            isHot: Boolean(data.isHot),
          };
          setWeather(next);
          localStorage.setItem("cj_weather_v1", JSON.stringify({ ts: Date.now(), data: next }));
          window.alert(gf(gender, "נשמר. מעכשיו תקבלי התאמות קטנות לפי מזג אוויר.", "נשמר. מעכשיו תקבל התאמות קטנות לפי מזג אוויר."));
        } catch {
          /* ignore */
        }
      },
      () => {
        window.alert(gf(gender, "לא אישרת מיקום כרגע.", "לא אישרת מיקום כרגע."));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 }
    );
  }

  function clearWeather() {
    localStorage.removeItem("cj_weather_v1");
    setWeather(null);
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-8 md:pt-12" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
        >
          חזרה
        </Link>
        <h1 className="panel-title-cherry text-lg">הגדרות</h1>
        <div className="w-[4.25rem]" aria-hidden />
      </div>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-base font-extrabold text-[var(--stem)]">צלילים</h2>
        <button
          type="button"
          className="mt-3 w-full rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-4 text-base font-bold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
          onClick={() => {
            const next = !loadSoundEffectsEnabled();
            saveSoundEffectsEnabled(next);
            setSoundsOn(next);
          }}
        >
          צלילים באפליקציה — {soundsOn ? "מופעל" : "כבוי"}
        </button>
      </motion.section>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-base font-extrabold text-[var(--stem)]">מיקום ומזג אוויר</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--stem)]/75">
          {gf(
            gender,
            "אופציונלי: אם תאשרי מיקום, נוכל להוסיף המלצות קטנות לפי מזג האוויר (למשל מים בשרב / מרק בגשם).",
            "אופציונלי: אם תאשר מיקום, נוכל להוסיף המלצות קטנות לפי מזג האוויר (למשל מים בשרב / מרק בגשם)."
          )}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-stem flex-1 rounded-xl py-3 text-sm font-extrabold" onClick={() => void enableWeather()}>
            אישור מיקום
          </button>
          <button type="button" className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]" onClick={clearWeather}>
            מחיקת הרשאה/נתונים
          </button>
        </div>
        {weather && (
          <p className="mt-3 text-xs font-semibold text-[var(--stem)]/70">
            נשמר: {weather.tempC}° · {weather.description || "מזג אוויר"}
          </p>
        )}
      </motion.section>
    </div>
  );
}

