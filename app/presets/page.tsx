import { redirect } from "next/navigation";

/** נתיב ישן — ארוחות שמורות מוצגות במילון */
export default function PresetsRedirectPage() {
  redirect("/dictionary");
}
