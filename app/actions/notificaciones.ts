"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function marcarLeidas(formData: FormData) {
  const id = formData.get("id");
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: id ? [String(id)] : null });
  revalidatePath("/", "layout");
}
