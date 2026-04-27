"use client";

import { AdminGuard } from "@/components/AdminGuard";
import { AdminDashboard } from "@/components/AdminDashboard";

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  );
}
