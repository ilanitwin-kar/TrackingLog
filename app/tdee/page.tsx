"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

export default function TdeePage() {
  const router = useRouter();
  const [p, setP] = useState<UserProfile | null>(null);

  useEffect(() => {
    setP(loadProfile());
  }, []);

  if (!p) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8 md:py-12" dir="rtl">
        <BackToMenuButton />
        <p className="text-center text-[#333333]">טוען…</p>
      </div>
    );
  }

  const t = tdee(p.gender, p.weightKg, p.heightCm, p.age, p.activity);
  const target = dailyCalorieTarget(
    p.gender,
    p.weightKg,
    p.heightCm,
    p.age,
    p.deficit,
    p.activity
  );

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
            type="number"
            min={12}
            max={120}
            value={p.age}
            onChange={(e) => update("age", Number(e.target.value) || 0)}
            className="input-luxury-dark mt-1 w-full"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            גובה (ס״מ)
          </span>
          <input
            type="number"
            min={100}
            max={230}
            value={p.heightCm}
            onChange={(e) => update("heightCm", Number(e.target.value) || 0)}
            className="input-luxury-dark mt-1 w-full"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            משקל נוכחי (ק״ג)
          </span>
          <input
            type="number"
            min={30}
            max={250}
            step={0.1}
            value={p.weightKg}
            onChange={(e) => update("weightKg", Number(e.target.value) || 0)}
            className="input-luxury-dark mt-1 w-full"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#333333]">
            יעד משקל (ק״ג)
          </span>
          <input
            type="number"
            min={30}
            max={250}
            step={0.1}
            value={p.goalWeightKg}
            onChange={(e) => update("goalWeightKg", Number(e.target.value) || 0)}
            className="input-luxury-dark mt-1 w-full"
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
            type="number"
            min={100}
            max={1500}
            step={50}
            value={p.deficit}
            onChange={(e) => update("deficit", Number(e.target.value) || 0)}
            className="input-luxury-dark mt-1 w-full"
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
