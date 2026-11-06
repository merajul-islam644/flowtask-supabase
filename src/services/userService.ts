import { supabase } from "@/lib/supabase/client";
import type { HueName, User } from "@/types";

/**
 * Workspace members, read from the `profiles` table — the people tasks can be
 * assigned to. In Supabase every account gets a profile row automatically
 * (a database trigger on auth.users), so teammates appear here as soon as
 * they sign up.
 */

const HUES: HueName[] = ["iris", "teal", "amber", "rose", "green"];

/** Stable avatar color per user, derived from their id. */
function hueFor(id: string): HueName {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[hash % HUES.length];
}

function toUser(row: Record<string, unknown>): User | null {
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  const email = typeof row.email === "string" ? row.email : "";
  const name =
    (typeof row.name === "string" && row.name.trim()) ||
    email.split("@")[0] ||
    "User";
  const role = typeof row.role === "string" && row.role.trim() ? row.role.trim() : "Member";
  const hue = HUES.includes(row.hue as HueName) ? (row.hue as HueName) : hueFor(id);
  return { id, name, email, role, hue };
}

/** Everyone with a profile row — the whole workspace. */
export async function listWorkspaceUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, hue")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => toUser(row as Record<string, unknown>))
    .filter((user): user is User => user !== null);
}

/**
 * Supabase has no tenant provisioning: teammates join by signing up, and the
 * signup trigger creates their profile. Kept as an explicit error so the
 * settings screen reports it honestly instead of pretending to invite.
 */
export async function inviteUser(
  _email: string,
  _firstName?: string,
  _lastName?: string,
  _roles?: string[],
): Promise<void> {
  throw new Error(
    "Invites are not set up yet — share the app URL and have teammates create their own account.",
  );
}

/** Organizations/roles are out of scope for the Supabase cut-over. */
export async function grantUserOrganizationRole(
  _userId: string,
  _organizationId: string,
  _roles?: string[],
): Promise<void> {
  throw new Error("Organization roles are not available in this build.");
}

/** Per-user permission sets are an IAM concept; Supabase RLS governs access. */
export async function listUserPermissionIds(
  _userId?: string,
  _organizationId?: string,
): Promise<string[]> {
  return [];
}

export async function setUserPermissions(
  _userId: string,
  _organizationId: string,
  _permissionIds: string[],
): Promise<void> {
  // No direct permission grants on Supabase — access is RLS-based.
}
