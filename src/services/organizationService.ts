/**
 * Single-workspace stub for the Supabase build. Supabase has no built-in
 * organization concept; the app runs in one implicit workspace. The exports
 * keep their original shapes so OrgSwitcher and the store compile untouched —
 * with an empty org list the switcher simply stays hidden.
 */

export interface MyOrganization {
  id: string;
  name: string;
}

export interface MyOrganizationsResult {
  organizations: MyOrganization[];
  activeId: string;
}

/** Raised when a switch is refused or silently dropped. Kept because
    OrgSwitcher imports the class by name. */
export class SwitchOrganizationError extends Error {
  readonly sessionExpired: boolean;
  constructor(message: string, sessionExpired = false) {
    super(message);
    this.name = "SwitchOrganizationError";
    this.sessionExpired = sessionExpired;
  }
}

export async function listMyOrganizations(): Promise<MyOrganizationsResult> {
  return { organizations: [], activeId: "" };
}

export async function switchOrganization(_organizationId: string): Promise<void> {
  throw new SwitchOrganizationError("This build runs a single workspace — nothing to switch.");
}

export async function fetchMyIdentity(): Promise<{ roles: string[]; activeOrganizationId: string }> {
  return { roles: ["member"], activeOrganizationId: "" };
}

export async function createOrganization(_name: string, _description = ""): Promise<string> {
  throw new SwitchOrganizationError("Organizations are not available in this build.");
}
