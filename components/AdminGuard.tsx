"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { ADMIN_EMAIL } from "@/lib/adminConstants";

const AdminIdTokenContext = createContext<string | null>(null);

export function useAdminIdToken(): string | null {
  return useContext(AdminIdTokenContext);
}

type Props = {
  children: ReactNode;
};

export function AdminGuard({ children }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "denied" | "ready">("loading");
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setPhase("denied");
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      const email = (user?.email ?? "").trim().toLowerCase();
      const allowed = email === ADMIN_EMAIL.toLowerCase();
      if (!user || !allowed) {
        setPhase("denied");
        router.replace("/");
        return;
      }
      const t = await user.getIdToken();
      setIdToken(t);
      setPhase("ready");
    });
    return () => unsub();
  }, [router]);

  if (phase === "loading" || (phase === "ready" && !idToken)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--text)]/70">
        טוען…
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--border-cherry-soft)] bg-white p-6 text-center shadow-[var(--list-row-shadow)]">
        <p className="text-sm font-medium text-[var(--cherry)]">אין הרשאה</p>
        <p className="mt-2 text-sm text-[var(--text)]/75">מעבירים לדף הבית…</p>
      </div>
    );
  }

  return (
    <AdminIdTokenContext.Provider value={idToken}>
      {children}
    </AdminIdTokenContext.Provider>
  );
}
