"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type UserProfile,
  ensureBaselineWeightRowFromProfile,
  loadProfile,
  markWelcomeLeft,
  saveProfile,
} from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { DevAdminQuickEntry } from "@/components/DevAdminQuickEntry";
import { InfoCard } from "@/components/InfoCard";
import type { ActivityLevel, NutritionGoal } from "@/lib/tdee";
import {
  CALORIE_FLOOR_MESSAGE_HE,
  computeNutritionPlan,
  dailyCalorieTarget,
} from "@/lib/tdee";
import { gf, infoProfileBody, infoTdeeResultsBody } from "@/lib/hebrewGenderUi";
import { syncAuthEmailWithProfile } from "@/lib/localAuth";

const EMAIL_RE_TDEE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TdeeFieldId =
  | "email"
  | "firstName"
  | "age"
  | "heightCm"
  | "weightKg"
  | "goalWeightKg"
  | "nutritionGoal"
  | "deficit";

function getIncompleteTdeeFields(p: UserProfile): { id: TdeeFieldId; label: string }[] {
  const missing: { id: TdeeFieldId; label: string }[] = [];
  if (!EMAIL_RE_TDEE.test(p.email.trim())) missing.push({ id: "email", label: "אימייל" });
  if (!p.firstName.trim()) missing.push({ id: "firstName", label: "שם פרטי" });
  if (!p.age || p.age < 12 || p.age > 120) missing.push({ id: "age", label: "גיל" });
  if (!p.heightCm || p.heightCm < 100 || p.heightCm > 230) {
    missing.push({ id: "heightCm", label: "גובה" });
  }
  if (!p.weightKg || p.weightKg < 30 || p.weightKg > 250) {
    missing.push({ id: "weightKg", label: "משקל נוכחי" });
  }
  if (!p.goalWeightKg || p.goalWeightKg < 30 || p.goalWeightKg > 250) {
    missing.push({ id: "goalWeightKg", label: "יעד משקל" });
  }
  if (
    p.nutritionGoal !== "weight_loss" &&
    p.nutritionGoal !== "maintenance" &&
    p.nutritionGoal !== "muscle_gain"
  ) {
    missing.push({ id: "nutritionGoal", label: "מטרה" });
  }
  if (p.customDeficitEnabled === true) {
    if (!p.deficit || p.deficit < 50 || p.deficit > 500) {
      missing.push({ id: "deficit", label: "גירעון יומי" });
    }
  }
  return missing;
}

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
  const searchParams = useSearchParams();
  const [p, setP] = useState<UserProfile | null>(null);
  const [ageText, setAgeText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [weightText, setWeightText] = useState("");
  const [goalWeightText, setGoalWeightText] = useState("");
  const [deficitText, setDeficitText] = useState("");
  const [highlightFields, setHighlightFields] = useState<Set<TdeeFieldId>>(new Set());
  const [formBottomMsg, setFormBottomMsg] = useState<string | null>(null);
  const fieldEls = useRef<Partial<Record<TdeeFieldId, HTMLElement>>>({});

  const plan = useMemo(() => (p ? computeNutritionPlan(p) : null), [p]);

  const t = plan?.tdee ?? 0;
  const target = p ? dailyCalorieTarget(p) : 0;

  useEffect(() => {
    const loaded = loadProfile();
    const registered = loaded.onboardingComplete === true;
    if (!registered) {
      // Onboarding is now done via the wizard. Keep TDEE for post-registration edits.
      router.replace("/wizard");
      return;
    }

    setP(loaded);
    setAgeText(String(loaded.age ?? ""));
    setHeightText(String(loaded.heightCm ?? ""));
    setWeightText(String(loaded.weightKg ?? ""));
    setGoalWeightText(String(loaded.goalWeightKg ?? ""));
    setDeficitText(
      loaded.customDeficitEnabled && loaded.deficit > 0
        ? String(loaded.deficit)
        : ""
    );
  }, []);

  if (!p) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8 md:py-12" dir="rtl">
        <BackToMenuButton />
        <p className="text-center text-[var(--cherry)]">טוען…</p>
      </div>
    );
  }

  const registered = p.onboardingComplete === true;
  const gender = p.gender;

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setHighlightFields(new Set());
    setFormBottomMsg(null);
    setP((prev) => {
      if (!prev) return prev;
      const next: UserProfile = { ...prev, [key]: value };
      saveProfile(next);
      if (key === "email" && typeof value === "string") {
        syncAuthEmailWithProfile(value);
      }
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
    if (!p || registered) return;
    const missing = getIncompleteTdeeFields(p);
    if (missing.length > 0) {
      setHighlightFields(new Set(missing.map((m) => m.id)));
      setFormBottomMsg(
        `חסרים או מחוץ לטווח: ${missing.map((m) => m.label).join(" · ")}`
      );
      const firstEl = fieldEls.current[missing[0].id];
      firstEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = firstEl?.querySelector?.("input,select") as
        | HTMLInputElement
        | HTMLSelectElement
        | undefined;
      focusable?.focus?.();
      return;
    }
    setHighlightFields(new Set());
    setFormBottomMsg(null);
    markWelcomeLeft();
    const next: UserProfile = { ...p, onboardingComplete: true };
    saveProfile(next);
    ensureBaselineWeightRowFromProfile();
    setP(next);
    const from = searchParams.get("from");
    router.replace(from === "wizard" ? "/wizard" : "/");
  }

  function fieldWrapClass(id: TdeeFieldId): string {
    return highlightFields.has(id)
      ? "rounded-xl ring-2 ring-[#c62828] ring-offset-2 ring-offset-[rgba(255,250,250,0.9)]"
      : "";
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:py-12" dir="rtl">
      <BackToMenuButton />

      <div className="mb-6">
        <DevAdminQuickEntry variant="tdee" />
      </div>

      <motion.h1
        className="heading-page mb-2 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {registered ? "עריכת פרטים ויעד אישי" : "הרשמה — מחשבון TDEE"}
      </motion.h1>

      <InfoCard
        gender={gender}
        icon="👤"
        title="מילוי פרטים אישיים"
        body={infoProfileBody(gender)}
        className="mb-5"
      />
      <p className="mb-6 text-center text-sm font-medium text-[var(--cherry)]/85">
        {registered
          ? "עדכני פרטים ואז לחצי «שמירה» כדי לוודא שהכל התעדכן בכל המסכים."
          : gf(
              gender,
              "מלאי את כל השדות כדי להגדיר את היעד היומי ולהמשיך לדשבורד.",
              "מלא את כל השדות כדי להגדיר את היעד היומי ולהמשיך לדשבורד."
            )}
      </p>

      {registered ? (
        <div className="mb-5 flex justify-center">
          <motion.button
            type="button"
            className="btn-stem w-full max-w-sm rounded-xl py-3 text-base font-extrabold"
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              // For clarity: re-save + refresh dependent screens (weights baseline etc.).
              saveProfile(p);
              ensureBaselineWeightRowFromProfile();
              try {
                window.dispatchEvent(new Event("cj-profile-updated"));
              } catch {
                /* ignore */
              }
              router.back();
            }}
          >
            שמירה
          </motion.button>
        </div>
      ) : null}

      <motion.section
        className="glass-panel space-y-4 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          ref={(el) => {
            if (el) fieldEls.current.email = el;
          }}
          className={fieldWrapClass("email")}
        >
          <label className="block">
            <span className="text-sm font-semibold text-[var(--cherry)]">אימייל</span>
            <input
              type="email"
              autoComplete="email"
              value={p.email}
              onChange={(e) => update("email", e.target.value)}
              className="input-luxury-dark mt-1 w-full"
              placeholder="you@example.com"
            />
          </label>
        </div>

        <div
          ref={(el) => {
            if (el) fieldEls.current.firstName = el;
          }}
          className={fieldWrapClass("firstName")}
        >
          <label className="block">
            <span className="text-sm font-semibold text-[var(--cherry)]">שם פרטי</span>
            <input
              type="text"
              autoComplete="given-name"
              value={p.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              className="input-luxury-dark mt-1 w-full"
              placeholder="לפרסונליזציה בלוח המפה"
            />
          </label>
        </div>

        <div
          ref={(el) => {
            if (el) fieldEls.current.age = el;
          }}
          className={fieldWrapClass("age")}
        >
          <label className="block">
            <span className="text-sm font-semibold text-[var(--cherry)]">גיל</span>
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
              update("age", Math.max(12, Math.min(120, Math.round(n))));
            }}
            onBlur={() => {
              const n = parseOrNull(ageText);
              if (n == null) return;
              const clamped = Math.max(12, Math.min(120, Math.round(n)));
              setAgeText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder={gf(gender, "הזיני גיל…", "הזן גיל…")}
          />
          </label>
        </div>

        <div
          ref={(el) => {
            if (el) fieldEls.current.heightCm = el;
          }}
          className={fieldWrapClass("heightCm")}
        >
          <label className="block">
            <span className="text-sm font-semibold text-[var(--cherry)]">
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
                Math.max(100, Math.min(230, Math.round(n)))
              );
            }}
            onBlur={() => {
              const n = parseOrNull(heightText);
              if (n == null) return;
              const clamped = Math.max(100, Math.min(230, Math.round(n)));
              setHeightText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder={gf(gender, "הזיני גובה…", "הזן גובה…")}
          />
          </label>
        </div>

        <div
          ref={(el) => {
            if (el) fieldEls.current.weightKg = el;
          }}
          className={fieldWrapClass("weightKg")}
        >
          <label className="block">
            <span className="text-sm font-semibold text-[var(--cherry)]">
              משקל נוכחי (ק״ג)
            </span>
            <input
            type="text"
            inputMode="decimal"
            value={weightText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, true);
              setWeightText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update("weightKg", Math.max(30, Math.min(250, Math.round(n * 10) / 10)));
            }}
            onBlur={() => {
              const n = parseOrNull(weightText);
              if (n == null) return;
              const clamped = Math.max(30, Math.min(250, Math.round(n * 10) / 10));
              setWeightText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder={gf(gender, "הזיני משקל…", "הזן משקל…")}
          />
          </label>
        </div>

        <div
          ref={(el) => {
            if (el) fieldEls.current.goalWeightKg = el;
          }}
          className={fieldWrapClass("goalWeightKg")}
        >
          <label className="block">
            <span className="text-sm font-semibold text-[var(--cherry)]">
              יעד משקל (ק״ג)
            </span>
            <input
            type="text"
            inputMode="decimal"
            value={goalWeightText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, true);
              setGoalWeightText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update(
                "goalWeightKg",
                Math.max(30, Math.min(250, Math.round(n * 10) / 10))
              );
            }}
            onBlur={() => {
              const n = parseOrNull(goalWeightText);
              if (n == null) return;
              const clamped = Math.max(30, Math.min(250, Math.round(n * 10) / 10));
              setGoalWeightText(String(clamped));
            }}
            className="input-luxury-dark mt-1 w-full"
            placeholder={gf(gender, "הזיני יעד…", "הזן יעד…")}
          />
          </label>
        </div>

        <div
          ref={(el) => {
            if (el) fieldEls.current.nutritionGoal = el;
          }}
          className={fieldWrapClass("nutritionGoal")}
        >
          <span className="text-sm font-semibold text-[var(--cherry)]">
            מה המטרה שלך?
          </span>
          <div className="mt-2 space-y-2">
            {(
              [
                { id: "weight_loss" as const, label: "ירידה במשקל" },
                { id: "maintenance" as const, label: "שמירה על הקיים" },
                { id: "muscle_gain" as const, label: "בניית מסת שריר" },
              ] satisfies { id: NutritionGoal; label: string }[]
            ).map((opt) => (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2.5 shadow-sm transition hover:bg-[var(--cherry-muted)]/40"
              >
                <input
                  type="radio"
                  name="nutritionGoal"
                  className="size-4 accent-[var(--cherry)]"
                  checked={p.nutritionGoal === opt.id}
                  onChange={() => update("nutritionGoal", opt.id)}
                />
                <span className="text-sm font-bold text-[var(--stem)]">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-[var(--cherry)]">
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

        <div
          ref={(el) => {
            if (el) fieldEls.current.deficit = el;
          }}
          className={fieldWrapClass("deficit")}
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-[var(--cherry)]"
              checked={p.customDeficitEnabled === true}
              onChange={(e) => {
                const on = e.target.checked;
                update("customDeficitEnabled", on);
                if (!on) {
                  update("deficit", 0);
                  setDeficitText("");
                } else {
                  const seed =
                    p.deficit >= 50 && p.deficit <= 500 ? p.deficit : 300;
                  setDeficitText(String(seed));
                  update("deficit", seed);
                }
              }}
            />
            <span className="text-sm font-bold leading-snug text-[var(--stem)]">
              {gf(
                gender,
                "רוצה להוסיף גירעון יומי מעל חישוב המטרה? סמני כאן ובחרי כמה קק״ל להוריד ביום (עד 500).",
                "רוצה להוסיף גירעון יומי מעל חישוב המטרה? סמן כאן ובחר כמה קק״ל להוריד ביום (עד 500)."
              )}
            </span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            disabled={!p.customDeficitEnabled}
            value={deficitText}
            onFocus={focusClearZero}
            onChange={(e) => {
              const next = sanitizeDecimal(e.target.value, false);
              setDeficitText(next);
              const n = parseOrNull(next);
              if (n == null) return;
              update("deficit", Math.max(50, Math.min(500, Math.round(n))));
            }}
            onBlur={() => {
              const n = parseOrNull(deficitText);
              if (n == null) {
                if (p.customDeficitEnabled) setDeficitText("300");
                return;
              }
              const clamped = Math.max(50, Math.min(500, Math.round(n)));
              setDeficitText(String(clamped));
              update("deficit", clamped);
            }}
            className={`input-luxury-dark mt-2 w-full ${
              !p.customDeficitEnabled ? "opacity-45" : ""
            }`}
            placeholder={gf(gender, "למשל 300 (בין 50 ל־500)", "למשל 300 (בין 50 ל־500)")}
            aria-label="גירעון יומי בקלוריות"
          />
        </div>
      </motion.section>

      <motion.div
        className="glass-panel mt-4 p-4 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="mb-4 text-start">
          <InfoCard
            gender={gender}
            icon="🔥"
            title="תוצאות ויעד יומי"
            body={infoTdeeResultsBody(gender)}
          />
        </div>
        {plan && plan.calorieFloorApplied ? (
          <p
            className="mb-4 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/50 px-3 py-2.5 text-sm font-semibold leading-relaxed text-[var(--stem)]"
            role="status"
          >
            {CALORIE_FLOOR_MESSAGE_HE}
          </p>
        ) : null}
        <p className="text-sm font-semibold text-[var(--cherry)]/85">TDEE (תחזוקה)</p>
        <p className="heading-page text-3xl tabular-nums">{t} קק״ל</p>
        {plan && p.customDeficitEnabled && p.deficit > 0 ? (
          <>
            <p className="mt-3 text-sm font-semibold text-[var(--cherry)]/85">
              יעד אחרי המטרה (לפני גירעון יומי)
            </p>
            <p className="text-xl font-bold tabular-nums text-[var(--stem)]">
              {plan.baseTargetKcal} קק״ל
            </p>
          </>
        ) : null}
        <p className="mt-3 text-sm font-semibold text-[var(--cherry)]/85">
          יעד צריכה יומי סופי
        </p>
        <p className="text-2xl font-bold text-[var(--ui-hero-metric)] tabular-nums">
          {target} קק״ל
        </p>
        {plan ? (
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-2 py-3 shadow-sm">
              <p className="text-[10px] font-extrabold text-[var(--cherry)]">חלבון</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-[var(--stem)]">
                {plan.macroGrams.proteinG}
              </p>
              <p className="text-[10px] font-semibold text-[var(--stem)]/60">גרם</p>
            </div>
            <div className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-2 py-3 shadow-sm">
              <p className="text-[10px] font-extrabold text-[var(--cherry)]">פחמימות</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-[var(--stem)]">
                {plan.macroGrams.carbsG}
              </p>
              <p className="text-[10px] font-semibold text-[var(--stem)]/60">גרם</p>
            </div>
            <div className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-2 py-3 shadow-sm">
              <p className="text-[10px] font-extrabold text-[var(--cherry)]">שומן</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-[var(--stem)]">
                {plan.macroGrams.fatG}
              </p>
              <p className="text-[10px] font-semibold text-[var(--stem)]/60">גרם</p>
            </div>
          </div>
        ) : null}
      </motion.div>

      <div className="mt-6 space-y-2">
        <Link
          href="/report"
          className="btn-gold flex w-full items-center justify-center rounded-xl py-3.5 text-center text-base font-bold shadow-sm transition hover:brightness-[1.02] active:scale-[0.99]"
        >
          לדוח האסטרטגי — לגלות את התוצאות
        </Link>
      </div>

      {!registered && (
        <motion.div
          className="mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <button
            type="button"
            className="btn-stem w-full rounded-xl py-3 text-base font-semibold"
            onClick={finishRegistration}
          >
            המשך לדשבורד
          </button>
          {formBottomMsg ? (
            <p
              className="mt-3 rounded-xl border-2 border-[#c62828] bg-[#fff5f5] px-3 py-2.5 text-center text-sm font-bold text-[#8b2e2e]"
              role="alert"
            >
              {formBottomMsg}
            </p>
          ) : null}
        </motion.div>
      )}

    </div>
  );
}
