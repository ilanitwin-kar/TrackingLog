"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gf } from "@/lib/hebrewGenderUi";
import {
  ensureBaselineWeightRowFromProfile,
  isProfileFormValid,
  loadProfile,
  markWelcomeLeft,
  saveProfile,
  type UserProfile,
  type WeighInFrequency,
} from "@/lib/storage";
import type { ActivityLevel, NutritionGoal } from "@/lib/tdee";
import { computeNutritionPlan, dailyCalorieTarget } from "@/lib/tdee";
import { dailyMacroTargetsGramsForProfile } from "@/lib/macroTargets";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";

type StepId =
  | "intro"
  | "email"
  | "firstName"
  | "age"
  | "height"
  | "weight"
  | "goalWeight"
  | "activity"
  | "nutritionGoal"
  | "deficitToggle"
  | "summary"
  | "weigh"
  | "weather"
  | "tour"
  | "done";

type WeatherEnableResult = { ok: true } | { ok: false; message: string };

function stepCoachLine(step: StepId, gender: "female" | "male"): string | null {
  switch (step) {
    case "intro":
      // Intro step has its own marketing hero line.
      return null;
    case "email":
      return gf(
        gender,
        "צעד ראשון—דואגים שתמיד תוכלי לחזור.",
        "צעד ראשון—דואגים שתמיד תוכל לחזור."
      );
    case "firstName":
      return gf(
        gender,
        "כאן זה נהיה אישי. ואת תראי את זה בדשבורד.",
        "כאן זה נהיה אישי. ואתה תראה את זה בדשבורד."
      );
    case "age":
      return "דיוק קטן עכשיו = תכנון מדויק אחר כך.";
    case "height":
      return "עוד רגע מסיימים את הבסיס.";
    case "weight":
      return "אמת אחת קטנה—והכל מתיישר.";
    case "goalWeight":
      return "מגדירים כיוון. אחר כך אנחנו מפרקים את זה לצעדים.";
    case "activity":
      return gf(
        gender,
        "כדי לחשב נכון—צריך לדעת כמה את זזה.",
        "כדי לחשב נכון—צריך לדעת כמה אתה זז."
      );
    case "nutritionGoal":
      return "מטרה ברורה עושה שקט בראש.";
    case "deficitToggle":
      return gf(gender, "בוחרות את הקצב. בלי לנחש.", "בוחרים את הקצב. בלי לנחש.");
    case "weigh":
      return "התמדה מנצחת. אנחנו נעזור לך לזכור בעדינות.";
    case "weather":
      return "התאמות קטנות לפי יום אמיתי—זה כל הסיפור.";
    case "tour":
      return "עוד דקה אחת—ואפשר לצאת לדרך.";
    case "done":
      return gf(
        gender,
        "אלופה. עכשיו פשוט עושים את היום הזה נכון.",
        "אלוף. עכשיו פשוט עושים את היום הזה נכון."
      );
    default:
      return null;
  }
}

function stepPrimaryCtaLabel(step: StepId, gender: "female" | "male"): string {
  if (step === "email") {
    return gf(gender, "המשיכי לצעד הבא", "קדימה, לשלב הבא");
  }
  if (step === "done") return "התחלה";
  return "הבא";
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function parseNum(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function sanitizeNumeric(raw: string, allowDecimal: boolean): string {
  const t = raw.trim();
  if (!t) return "";
  const normalized = t.replace(",", ".");
  let out = "";
  let dot = false;
  for (const ch of normalized) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (allowDecimal && ch === "." && !dot) {
      dot = true;
      out += ".";
    }
  }
  return out;
}

async function enableWeatherNow(gender: "female" | "male"): Promise<WeatherEnableResult> {
  if (!("geolocation" in navigator)) {
    return {
      ok: false,
      message: gf(gender, "אין גישה למיקום במכשיר הזה.", "אין גישה למיקום במכשיר הזה."),
    };
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      ok: false,
      message: gf(gender, "מיקום עובד רק בסביבה מאובטחת (HTTPS).", "מיקום עובד רק בסביבה מאובטחת (HTTPS)."),
    };
  }
  try {
    const permissionState: PermissionState | "" =
      "permissions" in navigator && navigator.permissions?.query
        ? await navigator.permissions
            .query({ name: "geolocation" })
            .then((x) => x.state)
            .catch(() => "")
        : "";
    if (permissionState === "denied") {
      return {
        ok: false,
        message: gf(
          gender,
          "המיקום חסום בהרשאות. פתחי הרשאות ואפשרי Location ואז נסי שוב.",
          "המיקום חסום בהרשאות. פתח הרשאות ואפשר Location ואז נסה שוב."
        ),
      };
    }

    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 30 * 60 * 1000,
      });
    });

    const res = await fetch(
      `/api/weather?lat=${encodeURIComponent(pos.coords.latitude)}&lon=${encodeURIComponent(pos.coords.longitude)}`
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
              "מזג האוויר לא זמין כרגע. נדאג לזה, ובינתיים אפשר להמשיך בלי זה.",
              "מזג האוויר לא זמין כרגע. נדאג לזה, ובינתיים אפשר להמשיך בלי זה."
            )
          : gf(
              gender,
              "לא הצלחתי למשוך מזג אוויר כרגע. נסי שוב בעוד רגע.",
              "לא הצלחתי למשוך מזג אוויר כרגע. נסה שוב בעוד רגע."
            );
      return { ok: false, message: msg };
    }

    localStorage.setItem(
      "cj_weather_v1",
      JSON.stringify({
        ts: Date.now(),
        data: {
          tempC: data.tempC,
          description: String(data.description ?? ""),
          isRain: Boolean(data.isRain),
          isHot: Boolean(data.isHot),
        },
      })
    );
    return { ok: true };
  } catch (e: unknown) {
    const maybe = e as { code?: unknown };
    const code = typeof maybe?.code === "number" ? maybe.code : null;
    const msg =
      code === 1
        ? gf(
            gender,
            "נראה שהמיקום נחסם. אשרי Location בהרשאות ואז נסי שוב.",
            "נראה שהמיקום נחסם. אשר Location בהרשאות ואז נסה שוב."
          )
        : code === 2
          ? gf(
              gender,
              "אי אפשר לקבל מיקום כרגע. נסי שוב מאוחר יותר.",
              "אי אפשר לקבל מיקום כרגע. נסה שוב מאוחר יותר."
            )
          : code === 3
            ? gf(
                gender,
                "לוקח יותר מדי זמן לקבל מיקום. נסי שוב.",
                "לוקח יותר מדי זמן לקבל מיקום. נסה שוב."
              )
            : gf(
                gender,
                "לא הצלחתי להפעיל מיקום כרגע. נסי שוב בעוד רגע.",
                "לא הצלחתי להפעיל מיקום כרגע. נסה שוב בעוד רגע."
              );
    return { ok: false, message: msg };
  }
}

const stepsOrder: StepId[] = [
  "intro",
  "email",
  "firstName",
  "age",
  "height",
  "weight",
  "goalWeight",
  "activity",
  "nutritionGoal",
  "deficitToggle",
  "summary",
  "weigh",
  "weather",
  "tour",
  "done",
];

const activities: { id: ActivityLevel; label: string }[] = [
  { id: "sedentary", label: "יושבנית (מעט תנועה)" },
  { id: "light", label: "קלה" },
  { id: "moderate", label: "בינונית" },
  { id: "active", label: "גבוהה" },
];

const goals: { id: NutritionGoal; label: string; hint: string }[] = [
  { id: "weight_loss", label: "ירידה במשקל", hint: "נשמור על יעד קלוריות נמוך מה־TDEE." },
  { id: "maintenance", label: "שימור", hint: "נכוון לשמירה יציבה לאורך זמן." },
  { id: "muscle_gain", label: "עלייה במסת שריר", hint: "נעלה יעד כדי לתמוך בבנייה." },
];

function computeWizardProgress(step: StepId): { idx: number; total: number } {
  const total = stepsOrder.length - 1; // excluding "intro" feel; still show all
  const idx = Math.max(0, stepsOrder.indexOf(step));
  return { idx, total };
}

export default function WizardPage() {
  const router = useRouter();
  const [p, setP] = useState<UserProfile>(() => loadProfile());
  const gender = p.gender;

  const [step, setStep] = useState<StepId>("intro");
  const [error, setError] = useState<string | null>(null);
  const [savingWeather, setSavingWeather] = useState(false);
  const [weatherMsg, setWeatherMsg] = useState<string | null>(null);

  // text inputs
  const [ageText, setAgeText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [weightText, setWeightText] = useState("");
  const [goalWeightText, setGoalWeightText] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // If user already completed onboarding, this page acts as optional tour; send home.
    const loaded = loadProfile();
    if (loaded.onboardingComplete === true && isProfileFormValid(loaded)) {
      router.replace("/");
      return;
    }
    setP(loaded);
    // start clean for required numeric fields
    setAgeText("");
    setHeightText("");
    setWeightText("");
    setGoalWeightText("");
  }, [router]);

  const progress = useMemo(() => computeWizardProgress(step), [step]);
  const coachLine = useMemo(() => stepCoachLine(step, gender), [step, gender]);

  function persist(patch: Partial<UserProfile>) {
    const next: UserProfile = { ...loadProfile(), ...patch, onboardingComplete: false };
    saveProfile(next);
    setP(next);
  }

  function goNext(nextStep?: StepId) {
    setError(null);
    setWeatherMsg(null);

    if (nextStep) {
      setStep(nextStep);
      return;
    }
    const idx = stepsOrder.indexOf(step);
    const next = stepsOrder[Math.min(stepsOrder.length - 1, idx + 1)]!;
    setStep(next);
  }

  function goBack() {
    setError(null);
    setWeatherMsg(null);
    const idx = stepsOrder.indexOf(step);
    const prev = stepsOrder[Math.max(0, idx - 1)]!;
    setStep(prev);
  }

  function validateAndContinue() {
    setError(null);
    if (step === "intro") return goNext();

    if (step === "email") {
      const email = (p.email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("נראה שהאימייל לא תקין. בדקי ונסי שוב.");
        return;
      }
      return goNext();
    }

    if (step === "firstName") {
      const name = (p.firstName ?? "").trim();
      if (!name) {
        setError("איך קוראים לך? זה עוזר לי להפוך את זה לאישי ומדויק.");
        return;
      }
      return goNext();
    }

    if (step === "age") {
      const n = parseNum(ageText);
      if (n == null) {
        setError("רק מספר. למשל 30.");
        return;
      }
      const age = clampInt(n, 0, 200);
      if (age < 12 || age > 120) {
        setError("גיל צריך להיות בין 12 ל־120.");
        return;
      }
      persist({ age });
      return goNext();
    }

    if (step === "height") {
      const n = parseNum(heightText);
      if (n == null) {
        setError("רק מספר. למשל 165.");
        return;
      }
      const heightCm = clampInt(n, 0, 400);
      if (heightCm < 100 || heightCm > 230) {
        setError("גובה צריך להיות בין 100 ל־230 ס״מ.");
        return;
      }
      persist({ heightCm });
      return goNext();
    }

    if (step === "weight") {
      const n = parseNum(weightText);
      if (n == null) {
        setError("רק מספר. למשל 70.5.");
        return;
      }
      const weightKg = Math.round(Math.min(300, Math.max(20, n)) * 10) / 10;
      if (weightKg < 30 || weightKg > 250) {
        setError("משקל צריך להיות בין 30 ל־250 ק״ג.");
        return;
      }
      persist({ weightKg });
      return goNext();
    }

    if (step === "goalWeight") {
      const n = parseNum(goalWeightText);
      if (n == null) {
        setError("רק מספר. למשל 62.");
        return;
      }
      const goalWeightKg = Math.round(Math.min(300, Math.max(20, n)) * 10) / 10;
      if (goalWeightKg < 30 || goalWeightKg > 250) {
        setError("יעד משקל צריך להיות בין 30 ל־250 ק״ג.");
        return;
      }
      persist({ goalWeightKg });
      return goNext();
    }

    if (step === "activity") {
      if (!p.activity) {
        setError("בחרי רמת פעילות כדי שאחשב יעד יומי מדויק.");
        return;
      }
      return goNext();
    }

    if (step === "nutritionGoal") {
      if (!p.nutritionGoal) {
        setError("בחרי מטרה כדי שאכוון את היעד היומי.");
        return;
      }
      return goNext();
    }

    if (step === "deficitToggle") {
      // Always show the summary before weigh-in settings.
      return goNext("summary");
    }

    if (step === "summary") {
      return goNext("weigh");
    }

    if (step === "weigh") {
      return goNext();
    }

    if (step === "weather") {
      // optional
      return goNext();
    }

    if (step === "tour") {
      return goNext();
    }

    if (step === "done") {
      // finalize
      const final = { ...loadProfile(), onboardingComplete: true };
      if (!isProfileFormValid(final)) {
        setError("חסר משהו קטן—נחזיר אותך להשלים.");
        setStep("email");
        return;
      }
      markWelcomeLeft();
      saveProfile(final);
      ensureBaselineWeightRowFromProfile();
      router.replace("/");
      return;
    }
  }

  const primaryDisabled = useMemo(() => {
    if (step === "intro") return false;
    if (step === "email") return !(p.email ?? "").trim();
    if (step === "firstName") return !(p.firstName ?? "").trim();
    if (step === "age") return !ageText.trim();
    if (step === "height") return !heightText.trim();
    if (step === "weight") return !weightText.trim();
    if (step === "goalWeight") return !goalWeightText.trim();
    return false;
  }, [step, p.email, p.firstName, ageText, heightText, weightText, goalWeightText]);

  const primaryLabel = useMemo(() => stepPrimaryCtaLabel(step, gender), [step, gender]);

  const plan = useMemo(() => computeNutritionPlan(p), [p]);
  const targetKcal = useMemo(() => dailyCalorieTarget(p), [p]);
  const macro = useMemo(
    () => dailyMacroTargetsGramsForProfile(targetKcal, p.weightKg, p.gender),
    [targetKcal, p.weightKg, p.gender]
  );
  const daysToGoal = useMemo(
    () => getDaysRemainingToGoal(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getDaysRemainingToGoal קורא מ-storage; p מסמן שינוי טופס
    [p],
  );
  const monthsToGoal = useMemo(() => {
    if (daysToGoal == null) return null;
    return Math.max(1, Math.round((daysToGoal / 30) * 10) / 10);
  }, [daysToGoal]);

  return (
    <div className="mx-auto max-w-lg px-4 py-10" dir="rtl">
      <p className="mb-2 text-center text-xs font-extrabold tracking-wide text-[var(--cherry)]/80">
        {gf(gender, "ברוכה הבאה לאינטליגנציה קלורית", "ברוך הבא לאינטליגנציה קלורית")}
      </p>
      <motion.h1
        className="heading-page mb-2 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        מתחילים חכם
      </motion.h1>
      <p className="mx-auto mb-4 max-w-md text-center text-sm font-semibold leading-relaxed text-[var(--stem)]/80">
        כמה מסכים קצרים — ואז הדשבורד יתאים את עצמו אלייך.
      </p>

      <div className="mx-auto mb-4 max-w-md">
        <div className="flex items-center justify-between text-[11px] font-bold text-[var(--stem)]/70">
          <span>שלב {Math.max(1, progress.idx + 1)} מתוך {progress.total}</span>
          <span className="tabular-nums">{Math.round(((progress.idx + 1) / progress.total) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f0f0]">
          <div
            className="h-full rounded-full bg-[var(--cherry)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, ((progress.idx + 1) / progress.total) * 100))}%` }}
          />
        </div>
      </div>

      <div className="glass-panel p-4">
        {coachLine ? (
          <p className="mb-3 text-center text-sm font-extrabold text-[var(--stem)]/85">
            {coachLine}
          </p>
        ) : null}
        <AnimatePresence mode="wait">
          {step === "intro" ? (
            <motion.div key="intro" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <p className="text-center text-sm font-extrabold text-[var(--stem)]">
                {gf(
                  gender,
                  "המהפכה האישית שלך מתחילה בעוד 60 שניות.",
                  "הגיע הזמן להפסיק לנחש ולהתחיל למדוד."
                )}
              </p>

              <h2
                className={`mt-3 text-center text-[clamp(1.45rem,4.6vw,2.05rem)] font-black leading-tight tracking-tight ${
                  gender === "male" ? "text-[var(--ui-page-heading)]" : "text-[var(--cherry)]"
                }`}
              >
                {gf(
                  gender,
                  "מוכנה לפצח את הקוד של הגוף שלך?",
                  "מוכן לבנות את הגוף החזק ביותר שלך?"
                )}
              </h2>

              <p className="mx-auto mt-3 max-w-md text-center text-sm font-semibold leading-relaxed text-[var(--text)]/85">
                {gf(
                  gender,
                  "עזבי כל מה שידעת על דיאטות. כאן אנחנו בונים לך אינטליגנציה קלורית – אלגוריתם מדויק שמותאם רק לפיזיולוגיה שלך. כמה שאלות קצרות, ואת בדרך לגוף שתמיד חלמת עליו.",
                  "אנחנו הולכים לחשב עבורך את נוסחת ה-TDEE המנצחת. בלי בערך ובלי טעויות. אבחון פיזיולוגי ממוקד שיעניק לך את המפתח לחיטוב מקסימלי ולביצועי שיא. אתה מוכן לזה?"
                )}
              </p>

              <button
                type="button"
                className={
                  gender === "male"
                    ? "mt-4 w-full rounded-2xl bg-[var(--cherry)] px-4 py-4 text-base font-black text-white shadow-[0_10px_30px_rgba(2,6,23,0.25)] transition hover:brightness-105 active:scale-[0.99]"
                    : "btn-stem mt-4 w-full rounded-2xl py-4 text-base font-black shadow-[0_10px_30px_rgba(21,128,61,0.35)] transition active:scale-[0.99]"
                }
                onClick={() => validateAndContinue()}
              >
                {gf(gender, "בואי נצא לדרך!", "אני מוכן, בוא נתחיל!")}
              </button>
            </motion.div>
          ) : null}

          {step === "email" ? (
            <motion.div key="email" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <p
                className={`text-center text-sm font-extrabold ${
                  gender === "male" ? "text-sky-700" : "text-[var(--stem)]"
                }`}
              >
                {gf(gender, "הבית החדש של התוצאות שלך.", "אבטח את פרופיל הביצועים שלך.")}
              </p>

              <h2
                className={`mt-3 text-center text-[clamp(1.35rem,4.2vw,1.9rem)] font-black leading-tight tracking-tight ${
                  gender === "male" ? "text-[var(--ui-page-heading)]" : "text-[var(--cherry)]"
                }`}
              >
                {gf(gender, "צרי לעצמך גישה לנוסחת החיטוב.", "צור לעצמך גישה לנוסחת החיטוב.")}
              </h2>

              <p className="mx-auto mt-3 max-w-md text-center text-sm font-semibold leading-relaxed text-[var(--text)]/85">
                {gf(
                  gender,
                  "כדי שהאלגוריתם שלנו יתחיל לעבוד בשבילך והנתונים שלך יישמרו בבטחה, אנחנו צריכים לחבר אותך למערכת. זה הצעד הראשון בדרך לגוף החלומות שלך.",
                  "כדי שנוכל לסנכרן את נתוני ה-TDEE שלך ולתת לך גישה לתוצאות מכל מכשיר ובכל זמן, הזן את כתובת האימייל שתשמש אותך לכניסה."
                )}
              </p>
              <input
                ref={inputRef}
                type="email"
                autoComplete="email"
                value={p.email ?? ""}
                onChange={(e) => persist({ email: e.target.value })}
                className="input-luxury-dark mt-3 w-full"
                placeholder={gf(gender, "כתובת האימייל המנצחת שלך", "כתובת האימייל שלך")}
              />
            </motion.div>
          ) : null}

          {step === "firstName" ? (
            <motion.div key="firstName" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">איך קוראים לך?</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">
                אני אוהב לדבר איתך אישי. זה גם יופיע בדשבורד.
              </p>
              <input
                type="text"
                autoComplete="given-name"
                value={p.firstName ?? ""}
                onChange={(e) => persist({ firstName: e.target.value })}
                className="input-luxury-dark mt-3 w-full"
                placeholder="אילנית"
              />
            </motion.div>
          ) : null}

          {step === "age" ? (
            <motion.div key="age" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">בת כמה את?</h2>
              <input
                inputMode="numeric"
                value={ageText}
                onChange={(e) => setAgeText(e.target.value.replace(/[^\d]/g, ""))}
                className="input-luxury-dark mt-3 w-full"
                placeholder="30"
              />
            </motion.div>
          ) : null}

          {step === "height" ? (
            <motion.div key="height" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">גובה בס״מ</h2>
              <input
                inputMode="numeric"
                value={heightText}
                onChange={(e) => setHeightText(e.target.value.replace(/[^\d]/g, ""))}
                className="input-luxury-dark mt-3 w-full"
                placeholder="165"
              />
            </motion.div>
          ) : null}

          {step === "weight" ? (
            <motion.div key="weight" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">משקל נוכחי</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">אפשר גם עם חצי (70.5).</p>
              <input
                inputMode="decimal"
                value={weightText}
                onChange={(e) => setWeightText(sanitizeNumeric(e.target.value, true))}
                className="input-luxury-dark mt-3 w-full"
                placeholder="70.5"
              />
            </motion.div>
          ) : null}

          {step === "goalWeight" ? (
            <motion.div key="goalWeight" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">יעד משקל</h2>
              <input
                inputMode="decimal"
                value={goalWeightText}
                onChange={(e) => setGoalWeightText(sanitizeNumeric(e.target.value, true))}
                className="input-luxury-dark mt-3 w-full"
                placeholder="62"
              />
            </motion.div>
          ) : null}

          {step === "activity" ? (
            <motion.div key="activity" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">רמת פעילות</h2>
              <div className="mt-3 grid gap-2">
                {activities.map((a) => {
                  const selected = p.activity === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`w-full rounded-2xl border-2 px-4 py-3 text-start text-sm font-extrabold shadow-sm transition ${
                        selected
                          ? "border-[var(--stem)] bg-[var(--cherry-muted)] text-[var(--stem)]"
                          : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                      }`}
                      onClick={() => persist({ activity: a.id })}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : null}

          {step === "nutritionGoal" ? (
            <motion.div key="nutritionGoal" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">מה המטרה שלך?</h2>
              <div className="mt-3 grid gap-2">
                {goals.map((g) => {
                  const selected = p.nutritionGoal === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={`w-full rounded-2xl border-2 px-4 py-3 text-start shadow-sm transition ${
                        selected
                          ? "border-[var(--stem)] bg-[var(--cherry-muted)]"
                          : "border-[var(--border-cherry-soft)] bg-white hover:bg-[var(--cherry-muted)]"
                      }`}
                      onClick={() => persist({ nutritionGoal: g.id })}
                    >
                      <div className="text-sm font-extrabold text-[var(--stem)]">{g.label}</div>
                      <div className="mt-0.5 text-xs font-semibold text-[var(--stem)]/75">{g.hint}</div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : null}

          {step === "deficitToggle" ? (
            <motion.div key="deficitToggle" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">כמה גירעון יומי תרצי?</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">
                זה קובע כמה “אגרסיבי” יהיה היעד. אם לא בטוחה—תתחילי מתון, אפשר לשנות בהמשך.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-2xl border-2 px-4 py-3 text-start text-sm font-extrabold shadow-sm transition ${
                    !p.customDeficitEnabled
                      ? "border-[var(--stem)] bg-[var(--cherry-muted)] text-[var(--stem)]"
                      : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  }`}
                  onClick={() => persist({ customDeficitEnabled: false, deficit: 0 })}
                >
                  <div className="text-[13px] font-black">0 קק״ל</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--stem)]/75">מתון / בלי תוספת</div>
                </button>
                <button
                  type="button"
                  className={`rounded-2xl border-2 px-4 py-3 text-start text-sm font-extrabold shadow-sm transition ${
                    p.customDeficitEnabled && p.deficit === 200
                      ? "border-[var(--stem)] bg-[var(--cherry-muted)] text-[var(--stem)]"
                      : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  }`}
                  onClick={() => persist({ customDeficitEnabled: true, deficit: 200 })}
                >
                  <div className="text-[13px] font-black">200 קק״ל</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--stem)]/75">מתון</div>
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-2xl border-2 px-4 py-3 text-start text-sm font-extrabold shadow-sm transition ${
                    p.customDeficitEnabled && p.deficit === 350
                      ? "border-[var(--stem)] bg-[var(--cherry-muted)] text-[var(--stem)]"
                      : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  }`}
                  onClick={() => persist({ customDeficitEnabled: true, deficit: 350 })}
                >
                  <div className="text-[13px] font-black">350 קק״ל</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--stem)]/75">בינוני</div>
                </button>
                <button
                  type="button"
                  className={`rounded-2xl border-2 px-4 py-3 text-start text-sm font-extrabold shadow-sm transition ${
                    p.customDeficitEnabled && p.deficit === 500
                      ? "border-[var(--stem)] bg-[var(--cherry-muted)] text-[var(--stem)]"
                      : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  }`}
                  onClick={() => persist({ customDeficitEnabled: true, deficit: 500 })}
                >
                  <div className="text-[13px] font-black">500 קק״ל</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--stem)]/75">אגרסיבי</div>
                </button>
              </div>
            </motion.div>
          ) : null}

          {step === "summary" ? (
            <motion.div key="summary" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">הסיכום האישי שלך</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">
                {gf(
                  gender,
                  "זה מה שיניע אותך קדימה — פשוט וברור.",
                  "זה מה שיניע אותך קדימה — פשוט וברור."
                )}
              </p>

              <div className="mt-4 grid gap-2">
                <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 p-3">
                  <p className="text-xs font-bold text-[var(--stem)]/70">יעד קלוריות יומי</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-[var(--cherry)]">
                    {Math.round(targetKcal).toLocaleString("he-IL")} קק״ל
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--stem)]/75">
                    TDEE משוער: {Math.round(plan.tdee).toLocaleString("he-IL")} קק״ל
                  </p>
                </div>

                <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 p-3">
                  <p className="text-xs font-bold text-[var(--stem)]/70">מאקרו יומי (גרם)</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-2 py-2 text-center">
                      <p className="text-[11px] font-bold text-[var(--stem)]/70">חלבון</p>
                      <p className="mt-0.5 text-lg font-black tabular-nums text-[var(--stem)]">{Math.round(macro.proteinG)}ג׳</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-2 py-2 text-center">
                      <p className="text-[11px] font-bold text-[var(--stem)]/70">פחמימה</p>
                      <p className="mt-0.5 text-lg font-black tabular-nums text-[var(--stem)]">{Math.round(macro.carbsG)}ג׳</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-2 py-2 text-center">
                      <p className="text-[11px] font-bold text-[var(--stem)]/70">שומן</p>
                      <p className="mt-0.5 text-lg font-black tabular-nums text-[var(--stem)]">{Math.round(macro.fatG)}ג׳</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 p-3">
                  <p className="text-xs font-bold text-[var(--stem)]/70">זמן משוער ליעד</p>
                  {daysToGoal != null ? (
                    <p className="mt-1 text-base font-extrabold text-[var(--cherry)]">
                      בערך {daysToGoal.toLocaleString("he-IL")} ימים
                      {monthsToGoal != null ? ` (≈ ${monthsToGoal} חודשים)` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-[var(--stem)]/80">
                      נחשב את זה אחרי שהיעד והגירעון ישבו בדיוק.
                    </p>
                  )}
                  <p className="mt-2 text-sm font-extrabold leading-relaxed text-[var(--stem)]/90">
                    {gf(
                      gender,
                      "עכשיו זה הרגע שלך. את לא מתחילה “דיאטה”—את מתחילה שליטה. בואי נעשה את היום הראשון מדויק.",
                      "עכשיו זה הרגע שלך. אתה לא מתחיל “דיאטה”—אתה מתחיל שליטה. בוא נעשה את היום הראשון מדויק."
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          ) : null}

          {step === "weigh" ? (
            <motion.div key="weigh" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">תדירות שקילה</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">
                תזכורת עדינה בדשבורד—רק בימים שבחרת.
              </p>
              <label className="mt-4 block">
                <span className="block text-xs font-bold text-[var(--stem)]/80">תדירות</span>
                <select
                  className="select-luxury mt-1 w-full"
                  value={p.weighInFrequency as WeighInFrequency}
                  onChange={(e) => persist({ weighInFrequency: e.target.value as WeighInFrequency })}
                >
                  <option value="daily">יומית</option>
                  <option value="weekly">שבועית</option>
                  <option value="monthly">חודשית</option>
                </select>
              </label>
              {p.weighInFrequency === "weekly" ? (
                <label className="mt-3 block">
                  <span className="block text-xs font-bold text-[var(--stem)]/80">יום בשבוע</span>
                  <select
                    className="select-luxury mt-1 w-full"
                    value={String(p.weighInWeekday ?? 1)}
                    onChange={(e) => persist({ weighInWeekday: clampInt(parseInt(e.target.value, 10) || 0, 0, 6) })}
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
              {p.weighInFrequency === "monthly" ? (
                <label className="mt-3 block">
                  <span className="block text-xs font-bold text-[var(--stem)]/80">יום בחודש</span>
                  <select
                    className="select-luxury mt-1 w-full"
                    value={String(p.weighInMonthDay ?? 1)}
                    onChange={(e) => persist({ weighInMonthDay: clampInt(parseInt(e.target.value, 10) || 1, 1, 28) })}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </motion.div>
          ) : null}

          {step === "weather" ? (
            <motion.div key="weather" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">מזג אוויר</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">
                אם תאשרי מיקום, אוסיף טיפ קטן במשפט המוטיבציה לפי מזג האוויר.
              </p>
              {weatherMsg ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                  {weatherMsg}
                </p>
              ) : null}
              <button
                type="button"
                className="btn-stem mt-4 w-full rounded-xl py-3 text-sm font-extrabold disabled:opacity-50"
                disabled={savingWeather}
                onClick={() => {
                  setWeatherMsg(null);
                  setSavingWeather(true);
                  void enableWeatherNow(gender).then((r) => {
                    setSavingWeather(false);
                    setWeatherMsg(r.ok ? gf(gender, "מעולה! חיברנו מזג אוויר.", "מעולה! חיברנו מזג אוויר.") : r.message);
                  });
                }}
              >
                {savingWeather ? "בודקת…" : "הפעלת מזג אוויר"}
              </button>
              <button
                type="button"
                className="mt-2 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                onClick={validateAndContinue}
              >
                דלגי בינתיים
              </button>
            </motion.div>
          ) : null}

          {step === "tour" ? (
            <motion.div key="tour" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">איך זה עובד</h2>
              <ul className="mt-3 space-y-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">
                <li>- בדשבורד תראי את <span className="font-extrabold text-[var(--cherry)]">הצעד הבא שלך</span> (משקל / קיזוז / הוספת מזון).</li>
                <li>- הזנת משקל וצעדים זמינה גם במודאלים מהירים.</li>
                <li>- “מרכז השליטה” מסביר כל פיצ׳ר בלי להציף את הבית.</li>
              </ul>
            </motion.div>
          ) : null}

          {step === "done" ? (
            <motion.div key="done" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <h2 className="text-lg font-extrabold text-[var(--cherry)]">סיימנו</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text)]/80">
                יאללה—בואי נתחיל יום חכם.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
            {error}
          </p>
        ) : null}

        {step !== "intro" ? (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={goBack}
            >
              אחורה
            </button>
            <button
              type="button"
              disabled={primaryDisabled}
              className="btn-stem flex-1 rounded-xl py-3 text-sm font-extrabold disabled:opacity-50"
              onClick={validateAndContinue}
            >
              {primaryLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

