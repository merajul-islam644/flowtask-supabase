import { supabase } from "@/lib/supabase/client";

/**
 * Profile-avatar repository. The image bytes live in Supabase Storage's
 * public `avatars` bucket, one folder per user; the `profiles.avatar_path`
 * column points each account at its current picture.
 */

const BUCKET = "avatars";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const AVATAR_MAX_FILE_BYTES = MAX_FILE_BYTES;

function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(-80) || "avatar";
}

interface ProfileRow {
  id: string;
  email: string;
  avatar_path: string | null;
}

async function listProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, avatar_path");
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileRow[];
}

/** Storage paths for every member who has a picture, keyed by user id AND
    email — one read serves the whole workspace's avatars. */
export async function getAllAvatarFileIds(): Promise<Record<string, string>> {
  const rows = await listProfiles();
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!row.avatar_path) continue;
    if (row.id) map[row.id] = row.avatar_path;
    if (row.email) map[row.email.toLowerCase()] = row.avatar_path;
  }
  return map;
}

/** Point the signed-in user's profile at a (newly uploaded) storage path. */
export async function saveAvatar(userId: string, fileId: string, email = ""): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, avatar_path: fileId, ...(email ? { email } : {}) },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

/**
 * Upload an image and return its storage path (the value stored in
 * profiles.avatar_path). Public bucket: readable by URL as soon as it lands.
 */
export async function uploadAvatarFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Please pick an image under 5 MB.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Please pick an image file.");
  }

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Sign in to upload an avatar.");

  const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Retire a replaced picture from storage (the old file is simply removed). */
export async function deleteAvatarFile(fileId: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([fileId]);
  if (error) throw new Error(error.message);
}

/**
 * Resolve a storage path to its public URL. The bucket is public, so the URL
 * is stable — callers may still cache briefly (see lib/avatar.ts).
 */
export async function resolveAvatarUrl(fileId: string): Promise<string> {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileId);
  return data?.publicUrl ?? "";
}
