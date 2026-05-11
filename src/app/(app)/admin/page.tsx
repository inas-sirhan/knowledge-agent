import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminClient from "@/components/admin/admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <AdminClient userEmail={user.email || ""} />;
}
