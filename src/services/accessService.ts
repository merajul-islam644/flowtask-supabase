/**
 * Roles & permissions admin — stubbed for the Supabase build. Access control
 * is enforced by Row Level Security on the database; the IAM role/permission
 * catalog has no Supabase equivalent. Interfaces keep their original shapes
 * so SettingsPage compiles; the admin UI hides itself when the lists are
 * empty (same behavior the app already had for non-admins).
 */

export interface RoleInfo {
  itemId: string;
  name: string;
  slug: string;
  description: string;
  isBuiltIn: boolean;
}

export interface PermissionInfo {
  itemId: string;
  name: string;
  resource: string;
  resourceGroup: string;
  type: number;
}

export async function listRoles(): Promise<RoleInfo[]> {
  return [];
}

export async function listAssignableRoleSlugs(): Promise<string[]> {
  return [];
}

export async function listPermissions(): Promise<PermissionInfo[]> {
  return [];
}

export async function listRolePermissionIds(_slug: string): Promise<string[]> {
  return [];
}

export async function createRole(_name: string, _description = ""): Promise<void> {
  throw new Error("Custom roles are not available in this build — access is RLS-based.");
}

export async function assignRolePermissions(
  _slug: string,
  _addPermissions: string[],
  _removePermissions: string[],
): Promise<void> {
  throw new Error("Role permissions are not available in this build — access is RLS-based.");
}
