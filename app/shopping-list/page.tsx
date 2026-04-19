import { redirect } from "next/navigation";

/** כינוי לנתיב רשימת הקניות — המסך הקיים הוא `/shopping` */
export default function ShoppingListAliasPage() {
  redirect("/shopping");
}
