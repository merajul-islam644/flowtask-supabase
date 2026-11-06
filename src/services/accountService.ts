import { supabase } from "@/lib/supabase/client";

/**
 * The signed-in user acting on their own Supabase Auth account — the
 * self-service half of auth. Admin edits of OTHER users live in userService;
 * nothing here ever passes a user id (Supabase resolves "me" from the JWT).
 */

export interface MyAccount {
  firstName: string;
  lastName: string;
  email: string;
}

/** The signed-in user's own account record. */
export async function getMyAccount(): Promise<MyAccount> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const email = data.user?.email ?? "";
  const firstName = typeof meta.first_name === "string" ? meta.first_name : "";
  const lastName = typeof meta.last_name === "string" ? meta.last_name : "";
  // Signup stores the full name under `name`; split it when the parts are absent.
  if (!firstName && !lastName && typeof meta.name === "string") {
    const parts = meta.name.trim().split(/\s+/);
    return {
      firstName: parts.slice(0, -1).join(" ") || parts[0] || "",
      lastName: parts.length > 1 ? parts[parts.length - 1] : "",
      email,
    };
  }
  return { firstName, lastName, email };
}

/** Update the signed-in user's own name (auth metadata + profiles row). */
export async function updateMyName(firstName: string, lastName: string): Promise<void> {
  const name = [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ");
  const { error } = await supabase.auth.updateUser({
    data: { first_name: firstName, last_name: lastName, name },
  });
  if (error) throw new Error(error.message);
  // Keep the workspace-visible profile in sync (assignee lists, mentions).
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (userId) {
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: userId, name }, { onConflict: "id" });
    if (profileError) throw new Error(profileError.message);
  }
}

/** Authenticated password change. Supabase has no client-side "old password"
    check (the JWT proves identity), so `oldPassword` is accepted but unused. */
export async function changeMyPassword(_oldPassword: string, newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(
      /at least 6|should be at least/i.test(error.message)
        ? "Password must be at least 6 characters."
        : error.message,
    );
  }
}
