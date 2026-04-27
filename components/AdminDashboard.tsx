"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminIdToken } from "@/components/AdminGuard";
import type { AdminDictionaryItem, AdminUserOverview } from "@/lib/adminDataServer";

function idSortKey(id: string | undefined): number {
  if (!id) return 0;
  const n = Number(id.split("-")[0]);
  return Number.isFinite(n) ? n : 0;
}

export function AdminDashboard() {
  const token = useAdminIdToken();
  const [rows, setRows] = useState<AdminUserOverview[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!token) throw new Error("no_token");
      return fetch(path, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          Authorization: `Bearer ${token}`,
        },
      });
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await authFetch("/api/admin/overview");
        const j = (await res.json()) as { ok?: boolean; users?: AdminUserOverview[]; error?: string };
        if (cancel) return;
        if (!res.ok || !j.ok) {
          setErr(j.error === "server_admin_not_configured" ? "שרת הניהול לא מוגדר (מפתח שירות)" : j.error ?? "שגיאה");
          setRows([]);
        } else {
          setRows(j.users ?? []);
        }
      } catch {
        if (!cancel) {
          setErr("שגיאת רשת");
          setRows([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [token, authFetch]);

  const recentDictionaryFeed = useMemo(() => {
    type Row = { uid: string; email: string; item: AdminDictionaryItem };
    const flat: Row[] = [];
    for (const r of rows) {
      for (const it of r.dictionaryItems) {
        flat.push({ uid: r.uid, email: r.email, item: it });
      }
    }
    flat.sort((a, b) => idSortKey(b.item.id) - idSortKey(a.item.id));
    return flat.slice(0, 36);
  }, [rows]);

  async function downloadExport(
    file: "all" | "users" | "journal" | "dictionary" | "recipes",
    downloadName: string,
  ) {
    if (!token || exportingKey) return;
    setExportingKey(file);
    try {
      const q = file === "all" ? "" : `?file=${file}`;
      const res = await authFetch(`/api/admin/export${q}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(j.error ?? "ייצוא נכשל");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("ייצוא נכשל");
    } finally {
      setExportingKey(null);
    }
  }

  function toggleExpand(uid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-4" dir="rtl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--cherry)]">ניהול מערכת</h1>
          <p className="mt-1 text-sm text-[var(--text)]/80">
            משתמשים, פרופיל, יומנים, מילון אישי ומתכונים שמורים בענן
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                void downloadExport("all", `admin-export-${new Date().toISOString().slice(0, 10)}.csv`)
              }
              disabled={!!exportingKey || !token}
              className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--cherry)] shadow-[var(--list-row-shadow)] transition active:scale-[0.98] disabled:opacity-50"
            >
              {exportingKey === "all" ? "מייצא…" : "הכול בקובץ אחד (CSV)"}
            </button>
            <Link
              href="/"
              className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--cherry)] shadow-[var(--list-row-shadow)]"
            >
              דף הבית
            </Link>
          </div>
          <div className="max-w-xl rounded-xl border border-[var(--border-cherry-soft)]/80 bg-white/90 px-3 py-2 shadow-sm">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--stem)]/70">
              קבצים נפרדים (אקסל)
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {(
                [
                  ["users", "משתמשים", (d: string) => `admin-users-${d}.csv`] as const,
                  ["journal", "יומן", (d: string) => `admin-journal-${d}.csv`] as const,
                  ["dictionary", "מילון", (d: string) => `admin-dictionary-${d}.csv`] as const,
                  ["recipes", "מתכונים", (d: string) => `admin-recipes-${d}.csv`] as const,
              ]).map(([key, label, nameFn]) => {
                const d = new Date().toISOString().slice(0, 10);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      void downloadExport(key, nameFn(d))
                    }
                    disabled={!!exportingKey || !token}
                    className="rounded-lg border border-[var(--border-cherry-soft)] bg-[var(--accent)]/35 px-3 py-1.5 text-xs font-semibold text-[var(--cherry)] transition hover:bg-[var(--accent)]/55 disabled:opacity-50"
                  >
                    {exportingKey === key ? "מייצא…" : label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {err && (
        <div
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {err}
        </div>
      )}

      {!loading && rows.length > 0 && recentDictionaryFeed.length > 0 && (
        <section className="mb-8 rounded-2xl border border-[var(--border-cherry-soft)] bg-white p-4 shadow-[var(--list-row-shadow)]">
          <h2 className="text-base font-semibold text-[var(--cherry)]">פריטים אחרונים במילונים האישיים</h2>
          <p className="mt-1 text-xs text-[var(--text)]/70">
            ממוין לפי מזהה פנימי (בדרך כלל הוספה אחרונה למעלה)
          </p>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
            {recentDictionaryFeed.map(({ uid, email, item }, i) => (
              <li
                key={`${uid}-${item.id ?? item.food}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-cherry-soft)]/60 pb-2 last:border-0"
              >
                <span className="font-medium text-[var(--text)]">{item.food}</span>
                <span className="text-xs text-[var(--text)]/65">
                  {email}
                  {item.source ? ` · ${item.source}` : ""}
                  {item.lastCalories != null ? ` · ${item.lastCalories} קל׳` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <p className="py-12 text-center text-[var(--cherry)]">טוען נתונים…</p>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-[var(--text)]/70">לא נמצאו משתמשים או שאין גישה לנתונים.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-cherry-soft)] bg-white shadow-[var(--list-row-shadow)]">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="bg-[color-mix(in_srgb,var(--accent)_55%,white)] text-[var(--cherry)]">
              <tr>
                <th className="p-3 font-semibold">שם</th>
                <th className="p-3 font-semibold">אימייל</th>
                <th className="p-3 font-semibold">גיל</th>
                <th className="p-3 font-semibold">משקל (ק״ג)</th>
                <th className="p-3 font-semibold">יעד (ק״ג)</th>
                <th className="p-3 font-semibold">יומן</th>
                <th className="p-3 font-semibold">מילון</th>
                <th className="p-3 w-32 font-semibold">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.uid}>
                  <tr className="border-t border-[var(--border-cherry-soft)]">
                    <td className="p-3 text-[var(--text)]">{r.firstName}</td>
                    <td className="max-w-[200px] truncate p-3 text-[var(--text)]" title={r.email}>
                      {r.email}
                    </td>
                    <td className="p-3 tabular-nums">{r.age || "—"}</td>
                    <td className="p-3 tabular-nums">{r.weightKg ? r.weightKg.toFixed(1) : "—"}</td>
                    <td className="p-3 tabular-nums">{r.goalWeightKg ? r.goalWeightKg.toFixed(1) : "—"}</td>
                    <td className="p-3 text-xs text-[var(--text)]/80">
                      {r.journalDayCount} ימים
                      <br />
                      {r.journalEntryCount} רשומות
                    </td>
                    <td className="p-3 tabular-nums">{r.dictCount}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.uid)}
                        className="rounded-lg border border-[var(--border-cherry-soft)] bg-[var(--accent)]/40 px-2 py-1 text-xs font-medium text-[var(--cherry)]"
                      >
                        {expanded.has(r.uid) ? "הסתר מילון" : "הצג מילון"}
                      </button>
                    </td>
                  </tr>
                  {expanded.has(r.uid) && (
                    <tr className="bg-[var(--welcome-gradient-from)]/80">
                      <td colSpan={8} className="p-4">
                        <p className="mb-2 text-xs font-medium text-[var(--cherry)]">מילון אישי — {r.email}</p>
                        {r.dictionaryItems.length === 0 ? (
                          <p className="text-sm text-[var(--text)]/65">אין פריטים במילון</p>
                        ) : (
                          <div className="max-h-64 overflow-auto rounded-xl border border-[var(--border-cherry-soft)] bg-white">
                            <table className="w-full text-right text-xs">
                              <thead className="sticky top-0 bg-[var(--accent)]/60 text-[var(--cherry)]">
                                <tr>
                                  <th className="p-2">מזון</th>
                                  <th className="p-2">מקור</th>
                                  <th className="p-2">כמות</th>
                                  <th className="p-2">קלוריות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.dictionaryItems.map((it, idx) => (
                                  <tr key={it.id ?? `${it.food}-${idx}`} className="border-t border-[var(--border-cherry-soft)]/50">
                                    <td className="p-2 font-medium text-[var(--text)]">{it.food}</td>
                                    <td className="p-2 text-[var(--text)]/75">{it.source ?? "—"}</td>
                                    <td className="p-2 tabular-nums text-[var(--text)]/75">
                                      {it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : "—"}
                                    </td>
                                    <td className="p-2 tabular-nums">{it.lastCalories ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
