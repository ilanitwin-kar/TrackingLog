import { NextResponse } from "next/server";
import {
  buildAdminDictionaryOnlyCsv,
  buildAdminJournalOnlyCsv,
  buildAdminMasterCsv,
  buildAdminRecipesOnlyCsv,
  buildAdminUsersOnlyCsv,
  loadAdminExportRows,
  loadAdminOverview,
} from "@/lib/adminDataServer";
import { verifyAdminBearer } from "@/lib/adminAuthServer";

function csvResponse(body: string, filename: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(req: Request) {
  const v = await verifyAdminBearer(req);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: v.status });
  }
  try {
    const url = new URL(req.url);
    const file = (url.searchParams.get("file") ?? "all").toLowerCase();
    const date = new Date().toISOString().slice(0, 10);

    const overview = await loadAdminOverview();
    const { logs, dictRows, recipeRows } = await loadAdminExportRows(overview);

    switch (file) {
      case "users":
        return csvResponse(buildAdminUsersOnlyCsv(overview), `admin-users-${date}.csv`);
      case "journal":
        return csvResponse(buildAdminJournalOnlyCsv(logs), `admin-journal-${date}.csv`);
      case "dictionary":
        return csvResponse(buildAdminDictionaryOnlyCsv(dictRows), `admin-dictionary-${date}.csv`);
      case "recipes":
        return csvResponse(buildAdminRecipesOnlyCsv(recipeRows), `admin-recipes-${date}.csv`);
      case "all":
      default:
        return csvResponse(
          buildAdminMasterCsv(overview, logs, dictRows, recipeRows),
          `admin-export-${date}.csv`,
        );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "export_failed" }, { status: 500 });
  }
}
