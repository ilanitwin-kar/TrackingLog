"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { gf } from "@/lib/hebrewGenderUi";
import {
  clearAllLocalAppData,
  loadProfile,
  saveProfile,
  type WeighInFrequency,
} from "@/lib/storage";
import { resetJourneyStartToToday } from "@/lib/storage";
import { loadSoundEffectsEnabled, saveSoundEffectsEnabled } from "@/lib/soundSettings";
import { useRouter } from "next/navigation";

type WeatherCache = { ts: number; data: { tempC: number; description: string; isRain: boolean; isHot: boolean } };
type GeoPermissionState = "granted" | "denied" | "prompt";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(() => loadProfile());
  const gender = profile.gender;
  const [soundsOn, setSoundsOn] = useState(true);
  const [weather, setWeather] = useState<null | WeatherCache["data"]>(null);
  const [weatherEnabling, setWeatherEnabling] = useState(false);

  useEffect(() => {
    setSoundsOn(loadSoundEffectsEnabled());
    setProfile(loadProfile());
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

  function saveWeighIn(next: Partial<Pick<typeof profile, "weighInFrequency" | "weighInWeekday" | "weighInMonthDay">>) {
    const p = loadProfile();
    const merged = { ...p, ...next };
    saveProfile(merged);
    setProfile(merged);
  }

  async function enableWeather() {
    if (weatherEnabling) return;
    if (!("geolocation" in navigator)) {
      window.alert(gf(gender, "אין גישה למיקום במכשיר הזה.", "אין גישה למיקום במכשיר הזה."));
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      window.alert(
        gf(
          gender,
          "מיקום עובד רק בסביבה מאובטחת (HTTPS). אם את מריצה פיתוח, נסי דרך ה-PWA/פרודקשן או HTTPS.",
          "מיקום עובד רק בסביבה מאובטחת (HTTPS). אם אתה מריץ פיתוח, נסה דרך ה-PWA/פרודקשן או HTTPS."
        )
      );
      return;
    }

    setWeatherEnabling(true);
    try {
      const permissionState: GeoPermissionState | "" =
        "permissions" in navigator && navigator.permissions?.query
          ? await navigator.permissions
              .query({ name: "geolocation" })
              .then((x) => x.state)
              .catch(() => "")
          : "";

      if (permissionState === "denied") {
        window.alert(
          gf(
            gender,
            "המיקום חסום בהרשאות. פתחי את הגדרות האתר/האפליקציה ואפשרי Location ואז נסי שוב.",
            "המיקום חסום בהרשאות. פתח את הגדרות האתר/האפליקציה ואפשר Location ואז נסה שוב."
          )
        );
        return;
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 30 * 60 * 1000,
        });
      });

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const res = await fetch(
        `/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
      );
      const data = (await res.json()) as {
        ok?: boolean;
        tempC?: number;
        description?: string;
        isRain?: boolean;
        isHot?: boolean;
        reason?: string;
      };

      if (!data?.ok || typeof data.tempC !== "number") {
        const msg =
          data?.reason === "missing_api_key"
            ? gf(
                gender,
                "מזג האוויר לא זמין כרגע (חסר מפתח שירות). נדאג לזה, ובינתיים האפליקציה תעבוד בלי זה.",
                "מזג האוויר לא זמין כרגע (חסר מפתח שירות). נדאג לזה, ובינתיים האפליקציה תעבוד בלי זה."
              )
            : gf(
                gender,
                "לא הצלחתי למשוך מזג אוויר כרגע. נסי שוב בעוד רגע.",
                "לא הצלחתי למשוך מזג אוויר כרגע. נסה שוב בעוד רגע."
              );
        window.alert(msg);
        return;
      }

      const next = {
        tempC: data.tempC,
        description: String(data.description ?? ""),
        isRain: Boolean(data.isRain),
        isHot: Boolean(data.isHot),
      };
      setWeather(next);
      localStorage.setItem(
        "cj_weather_v1",
        JSON.stringify({ ts: Date.now(), data: next })
      );
      window.alert(
        gf(
          gender,
          "נשמר. מעכשיו תקבלי התאמות קטנות לפי מזג אוויר.",
          "נשמר. מעכשיו תקבל התאמות קטנות לפי מזג אוויר."
        )
      );
    } catch (e: unknown) {
      const maybe = e as { code?: unknown };
      const code = typeof maybe?.code === "number" ? maybe.code : null;
      const msg =
        code === 1
          ? gf(
              gender,
              "נראה שהמיקום נחסם. פתחי את הרשאות האפליקציה/הדפדפן ואשרי Location ואז נסי שוב.",
              "נראה שהמיקום נחסם. פתח את הרשאות האפליקציה/הדפדפן ואשר Location ואז נסה שוב."
            )
          : code === 2
            ? gf(
                gender,
                "אי אפשר לקבל מיקום כרגע (אין קליטה/שירותי מיקום). נסי שוב מאוחר יותר.",
                "אי אפשר לקבל מיקום כרגע (אין קליטה/שירותי מיקום). נסה שוב מאוחר יותר."
              )
            : code === 3
              ? gf(
                  gender,
                  "לוקח יותר מדי זמן לקבל מיקום. נסי שוב או עברי לרשת אחרת.",
                  "לוקח יותר מדי זמן לקבל מיקום. נסה שוב או עבור לרשת אחרת."
                )
              : gf(
                  gender,
                  "לא הצלחתי להפעיל מיקום כרגע. נסי שוב בעוד רגע.",
                  "לא הצלחתי להפעיל מיקום כרגע. נסה שוב בעוד רגע."
                );
      window.alert(msg);
    } finally {
      setWeatherEnabling(false);
    }
  }

  function clearWeather() {
    localStorage.removeItem("cj_weather_v1");
    setWeather(null);
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-8 md:pt-12" dir="rtl">
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
            {weatherEnabling ? "מפעיל…" : "אישור מיקום"}
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

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-base font-extrabold text-[var(--stem)]">שקילה</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--stem)]/75">
          {gf(
            gender,
            "כדי לעזור בהתמדה, נוכל להזכיר לך לשקול לפי תדירות שתבחרי. ההזכרה מופיעה בדשבורד רק בימים הרלוונטיים.",
            "כדי לעזור בהתמדה, נוכל להזכיר לך לשקול לפי תדירות שתבחר. ההזכרה מופיעה בדשבורד רק בימים הרלוונטיים."
          )}
        </p>

        <label className="mt-3 block">
          <span className="block text-xs font-bold text-[var(--stem)]/80">תדירות שקילה</span>
          <select
            className="select-luxury mt-1 w-full"
            value={profile.weighInFrequency as WeighInFrequency}
            onChange={(e) => saveWeighIn({ weighInFrequency: e.target.value as WeighInFrequency })}
          >
            <option value="daily">יומית</option>
            <option value="weekly">שבועית</option>
            <option value="monthly">חודשית</option>
          </select>
        </label>

        {profile.weighInFrequency === "weekly" ? (
          <label className="mt-3 block">
            <span className="block text-xs font-bold text-[var(--stem)]/80">באיזה יום בשבוע?</span>
            <select
              className="select-luxury mt-1 w-full"
              value={String(profile.weighInWeekday ?? 1)}
              onChange={(e) =>
                saveWeighIn({ weighInWeekday: Math.min(6, Math.max(0, parseInt(e.target.value, 10) || 0)) })
              }
            >
              <option value="0">ראשון</option>
              <option value="1">שני</option>
              <option value="2">שלישי</option>
              <option value="3">רביעי</option>
              <option value="4">חמישי</option>
              <option value="5">שישי</option>
              <option value="6">שבת</option>
            </select>
          </label>
        ) : null}

        {profile.weighInFrequency === "monthly" ? (
          <label className="mt-3 block">
            <span className="block text-xs font-bold text-[var(--stem)]/80">באיזה יום בחודש?</span>
            <select
              className="select-luxury mt-1 w-full"
              value={String(profile.weighInMonthDay ?? 1)}
              onChange={(e) =>
                saveWeighIn({ weighInMonthDay: Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1)) })
              }
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </motion.section>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-base font-extrabold text-[var(--stem)]">התחלה מודרכת</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--stem)]/75">
          {gf(
            gender,
            "רוצה לראות שוב את מסכי ההתחלה? אפשר להפעיל את הוויזרד מחדש בכל רגע.",
            "רוצה לראות שוב את מסכי ההתחלה? אפשר להפעיל את הוויזרד מחדש בכל רגע."
          )}
        </p>
        <button
          type="button"
          className="btn-stem mt-3 w-full rounded-xl py-3 text-sm font-extrabold"
          onClick={() => {
            const p = loadProfile();
            const next = { ...p, wizardCompleted: false, onboardingComplete: false };
            saveProfile(next);
            router.push("/wizard");
          }}
        >
          הפעלת וויזרד מחדש
        </button>
      </motion.section>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-base font-extrabold text-[var(--stem)]">פרטיות ונתונים</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--stem)]/75">
          {gf(
            gender,
            "כאן אפשר למחוק את כל הנתונים שנשמרו מקומית במכשיר (יומן, משקל, מילון, תפריטים ועוד).",
            "כאן אפשר למחוק את כל הנתונים שנשמרו מקומית במכשיר (יומן, משקל, מילון, תפריטים ועוד)."
          )}
        </p>
        <button
          type="button"
          className="mt-3 w-full rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-4 text-base font-extrabold text-red-800 shadow-sm transition hover:bg-red-100"
          onClick={() => {
            const ok = window.confirm(
              gf(
                gender,
                "למחוק את כל הנתונים המקומיים? פעולה זו לא ניתנת לשחזור.",
                "למחוק את כל הנתונים המקומיים? פעולה זו לא ניתנת לשחזור."
              )
            );
            if (!ok) return;
            clearAllLocalAppData();
            window.location.replace("/welcome");
          }}
        >
          מחיקת כל הנתונים המקומיים
        </button>
      </motion.section>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-base font-extrabold text-[var(--stem)]">תהליך</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--stem)]/75">
          {gf(
            gender,
            "אם עצרת באמצע וחזרת אחרי זמן — אפשר להתחיל תהליך חדש. זה מאפס את נקודת ההתחלה של לוח הצבירה והסגירות, בלי למחוק נתונים ישנים.",
            "אם עצרת באמצע וחזרת אחרי זמן — אפשר להתחיל תהליך חדש. זה מאפס את נקודת ההתחלה של לוח הצבירה והסגירות, בלי למחוק נתונים ישנים."
          )}
        </p>
        <button
          type="button"
          className="mt-3 w-full rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-4 text-base font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
          onClick={() => {
            const ok = window.confirm(
              gf(
                gender,
                "להתחיל תהליך חדש? זה יאפס את לוח הצבירה והסגירות מהיום.",
                "להתחיל תהליך חדש? זה יאפס את לוח הצבירה והסגירות מהיום."
              )
            );
            if (!ok) return;
            resetJourneyStartToToday();
            window.alert(gf(gender, "בוצע. התהליך התחיל מחדש מהיום.", "בוצע. התהליך התחיל מחדש מהיום."));
          }}
        >
          התחלת תהליך מחדש
        </button>
      </motion.section>
    </div>
  );
}

