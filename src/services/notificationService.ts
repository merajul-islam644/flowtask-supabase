import { supabase } from "@/lib/supabase/client";
import type { Activity, ActivityKind } from "@/types";

/**
 * The per-user, server-side notification inbox, stored in the `notifications`
 * table (RLS: each user sees only their own rows). Notifications survive
 * sessions and devices — unlike the local Activity trail, which only records
 * what happened on this device.
 */

const PAGE_SIZE = 50;

/** What we store in each notification row. */
export interface NotificationPayload {
  kind: ActivityKind;
  message: string;
  actorId?: string;
  taskId?: string;
  projectId?: string;
}

interface NotificationRow {
  id: string;
  kind: string;
  message: string;
  actor_id: string | null;
  task_id: string | null;
  project_id: string | null;
  read: boolean;
  created_at: string;
}

/** The signed-in user's inbox, newest first, mapped onto the shared Activity
    shape so the notification panel renders it like any other activity. */
export async function listNotifications(): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, message, actor_id, task_id, project_id, read, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw new Error(error.message);
  return ((data ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    kind: (row.kind || "project_update") as ActivityKind,
    message: row.message || "Notification",
    actorId: row.actor_id ?? undefined,
    taskId: row.task_id ?? undefined,
    projectId: row.project_id ?? undefined,
    createdAt: row.created_at,
    read: row.read === true,
  }));
}

/** Push a notification: one row per target user. Row Level Security allows a
    member to notify the assignee of a task in a shared project; failures are
    best-effort at the call sites (never block the mutation that caused it). */
export async function sendTaskNotification(target: {
  userIds: string[];
  payload: NotificationPayload;
}): Promise<void> {
  const rows = target.userIds
    .filter((userId) => userId.length > 0)
    .map((userId) => ({
      user_id: userId,
      kind: target.payload.kind,
      message: target.payload.message,
      actor_id: target.payload.actorId || null,
      task_id: target.payload.taskId || null,
      project_id: target.payload.projectId || null,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) throw new Error(error.message);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);
  if (error) throw new Error(error.message);
}
