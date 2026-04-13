"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type UserProfile,
  isProfileFormValid,
  loadProfile,
  saveProfile,
} from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import type { ActivityLevel, Gender } from "@/lib/tdee";
import { dailyCalorieTarget, tdee } from "@/lib/tdee";

const activities: { id: ActivityLevel; label: string }[] = [
  { id: "sedentary", label: "יושבנית (מעט תנועה)" },
  { id: "light", label: "קלה" },
  { id: "moderate", label: "בינונית" },
  { id: "active", label: "גבוהה" },
];

function stripLeadingZeros(raw: string): string {
  // Keep "0." and "0," patterns (even though we normalize to ".")
  if (/^0[.,]/.test(raw)) return raw;
  return raw.replace(/^0+(?=\d)/, "");
}

function sanitizeDecimal(raw: string, allowDecimal: boolean): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const normalized = trimmed.replace(",", ".");
  let out = "";
  let dotSeen = false;
  for (const ch of normalized) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (allowDecimal && ch === "." && !dotSeen) {
      dotSeen = true;
      out += ".";
    }
  }
  return stripLeadingZeros(out);
}

function parseOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function TdeePage() {
  const router = useRouter();
  const [p, setP] = useState<UserProfile | null>(null);
  const [ageText, setAgeText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [weightText, setWeightText] = useState("");
  const [goalWeightText, setGoalWeightText] = useState("");
  const [deficitText, setDeficitText] = useState("");

  const t = useMemo(() => {
    if (!p) return 0;
    return tdee(p.gender, p.weightKg, p.heightCm, p.age, p.activity);
  }, [p]);

  const target = useMemo(() => {
    if (!p) return 0;
    return dailyCalorieTarget(
      p.gender,
      p.weightKg,
      p.heightCm,
      p.age,
      p.deficit,
      p.activity
    );
  }, [p]);

  useEffect(() => {
    const loaded = loadProfile();
    const registered = loaded.onboardingComplete === true;

    if (!registered) {
      // On first entry: show empty fields (no "0" and no defaults).
      setP({
        ...loaded,
        age: 0,
        heightCm: 0,
        weightKg: 0,
        goalWeightKg: 0,
        deficit: 0,
      });
      setAgeText("");
      setHeightText("");
      setWeightText("");
      setGoalWeightText("");
      setDeficitText("");
      return;
    }

    setP(loaded);
    setAgeText(String(loaded.age ?? ""));
    setHeightText(String(loaded.heightCm ?? ""));
    setWeightText(String(loaded.weightKg ?? ""));
    setGoalWeightText(String(loaded.goalWeightKg ?? ""));
    setDeficitText(String(loaded.deficit ?? ""));
  }, []);

  if (!p) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8 md:py-12" dir="rtl">
        <BackToMenuButton />
        <p className="text-center text-[#333333]">טוען…</p>
      </div>
    );
  }

  const registered = p.onboardingComplete === true;
  const formValid = isProfileFormValid(p);
  const canFinishRegistration = formValid && !registered;

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setP((prev) => {
      if (!prev) return prev;
      const next: UserProfile = { ...prev, [key]: value };
      saveProfile(next);
      return next;
    });
  }

  function focusClearZero(e: React.FocusEvent<HTMLInputElement>) {
    if (e.currentTarget.value.trim() === "0") {
      // Clear is more convenient than forcing delete.
      e.currentTarget.value = "";
      e.currentTarget.select();
    } else {
      e.currentTarget.select();
    }
  }

  function finishRegistration() {
    if (!canFinishRegistration) return;
    setP((prev) => {
      if (!prev) return prev;
      const next: UserProfile = { ...prev, onboardingComplete: true };
      saveProfile(next);
      return next;
    });
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:py-12" dir="rtl">
      <BackToMenuButton />

      <motion.h1
        className="mb-2 text-center text-3xl font-extrabold text-[#333333] md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {registered ? "עריכת פרטים ויעד TDEE" : "הרשמה — מחשבון TDEE"}
      </motion.h1>
      <p className="mb-6 text-center text-sm font-medium text-[#333333]/85">
        {registered
          ? "השינויים נשמרים אוטומטית. יעד הקלוריות בדשבורד מתעדכן מיד כשמשנים גירעון או פעילות."
          : "מלאי את כל השדות כדי להגדיר את היעד היומי ולהמשיך לדשבורד."}
      </p>

      <motion.section
        className="glass-panel space-y-4 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">אימייל</span>
          <input
            type="email"
            autoComplete="email"
            value={p.email}
            onChange={(e) => update("email", e.target.value)}
            className="input-luxury-dark mt-1 w-full"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">שם פרטי</span>
          <input
            type="text"
            autoComplete="given-name"
            value={p.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            className="input-luxury-dark mt-1 w-full"
            placeholder="לפרסונליזציה בלוח המפה"
          />
        </label>

        <fieldset className="flex gap-4">
          <legend className="mb-2 text-sm font-semibold text-[#333333]">
            מין
          </legend>
          <label className="flex items-center gap-2 font-medium text-[#333333]">
            <input
              type="radio"
              name="gender"
              checked={p.gender === "female"}
              onChange={() => update("gender", "female" as Gender)}
            />
            אישה
          </label>
          <label className="flex items-center gap-2 font-medium text-[#333333]">
            <input
              type="radio"
              name="gender"
              checked={p.gender === "male"}
              onChange={() => update("gender", "male" as Gender)}
            />
            גבר
          </label>
        </fieldset>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">גיל</span>
          <input
            type="text"
            inputMode="numeric"
            value={ageText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, false);
              setAgeText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update("age", Math.max(12, Math.min(120, Math.round(n))) as any);
            }}
            onBlur={() => {
              const n = parseOrNull(ageText);
              if (n == null) return;
              const clamped = Math.max(12, Math.min(120, Math.round(n)));
              setAgeText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder="הזיני גיל…"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            גובה (ס״מ)
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={heightText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, false);
              setHeightText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update(
                "heightCm",
                Math.max(100, Math.min(230, Math.round(n))) as any
              );
            }}
            onBlur={() => {
              const n = parseOrNull(heightText);
              if (n == null) return;
              const clamped = Math.max(100, Math.min(230, Math.round(n)));
              setHeightText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder="הזיני גובה…"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            משקל נוכחי (ק״ג)
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={weightText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, false);
              setWeightText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update("weightKg", Math.max(30, Math.min(250, n)) as any);
            }}
            onBlur={() => {
              const n = parseOrNull(weightText);
              if (n == null) return;
              const clamped = Math.max(30, Math.min(250, n));
              setWeightText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder="הזיני משקל…"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            יעד משקל (ק״ג)
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={goalWeightText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, false);
              setGoalWeightText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update("goalWeightKg", Math.max(30, Math.min(250, n)) as any);
            }}
            onBlur={() => {
              const n = parseOrNull(goalWeightText);
              if (n == null) return;
              const clamped = Math.max(30, Math.min(250, n));
              setGoalWeightText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder="הזיני יעד…"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            רמת פעילות
          </span>
          <select
            value={p.activity}
            onChange={(e) =>
              update("activity", e.target.value as ActivityLevel)
            }
            className="select-luxury mt-1 w-full"
          >
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            גירעון יומי מטרה (קק״ל)
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={deficitText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, false);
              setDeficitText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update("deficit", Math.max(100, Math.min(1500, Math.round(n))) as any);
            }}
            onBlur={() => {
              const n = parseOrNull(deficitText);
              if (n == null) return;
              const clamped = Math.max(100, Math.min(1500, Math.round(n)));
              setDeficitText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder="הזיני יעד…"
          />
        </label>
      </motion.section>

      <motion.div
        className="glass-panel mt-4 p-4 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <p className="text-sm font-semibold text-[#333333]/85">TDEE משוער</p>
        <p className="text-3xl font-extrabold text-[#333333]">
          {Math.round(t)} קק״ל
        </p>
        <p className="mt-3 text-sm font-semibold text-[#333333]/85">
          יעד צריכה יומי (אחרי גירעון)
        </p>
        <p className="text-2xl font-bold text-[#333333]">{target} קק״ל</p>
      </motion.div>

      {!registered && (
        <motion.div
          className="mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <button
            type="button"
            className="btn-gold w-full rounded-xl py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canFinishRegistration}
            onClick={finishRegistration}
          >
            המשך לדשבורד
          </button>
          {!formValid && (
            <p className="mt-2 text-center text-xs font-medium text-[#8b2e2e]">
              יש למלא את כל השדות (כולל אימייל תקין) בטווחים המותרים.
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
