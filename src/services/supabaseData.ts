import { supabase } from "@/lib/supabase/client";
import type { Activity, Project, Subtask, Task, TaskInput, ProjectInput } from "@/types";

/**
 * Supabase data layer. Same export surface the Blocks gateway adapter had —
 * taskService/projectService/activityService only swap their import. Rows use
 * snake_case DB columns; the to* mappers convert to the domain types.
 *
 * Every table is protected by Row Level Security (see supabase/migrations/),
 * so this publishable-key client only ever sees what the signed-in user may.
 */

type Row = Record<string, unknown>;

export const tasks = collection("tasks");
export const projects = collection("projects");
export const activities = collection("activities");

/** The signed-in user's id from the locally persisted session (no network).
    Insert policies require owner_id/user_id to match auth.uid(), so rows
    carry it from here when the domain model has no owner field. */
export async function sessionUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? "";
}

function collection(table: string) {
  return {
    table,
    /** Insert one row; resolves to the stored row (id included). */
    async create(payload: Row): Promise<Row> {
      const values = { ...payload };
      if (table === "projects" && !values.owner_id) values.owner_id = await sessionUserId();
      const { data, error } = await supabase.from(table).insert(values).select().single();
      if (error) throw new Error(error.message);
      return (data ?? {}) as Row;
    },
    /** Patch one row by id; updated_at is stamped here for timeful tables. */
    async update(id: string, patch: Row): Promise<Row> {
      const values: Row = { ...patch };
      if (table === "tasks") values.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from(table).update(values).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return (data ?? {}) as Row;
    },
    async delete(id: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async list(): Promise<Row[]> {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  };
}

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optStr(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function iso(value: unknown): string {
  if (typeof value === "string" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

/** The id of an insert result. Supabase rows carry `id` directly; the legacy
    itemId spellings stay accepted so old call sites keep compiling. */
export function resultItemId(response: unknown): string {
  const record = isRecord(response) ? response : {};
  return str(record.id) || str(record.itemId) || str(record.ItemId);
}

// ---------- Row ↔ domain mappers ----------

function toSubtasks(value: unknown): Subtask[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const subtasks = value
    .filter(isRecord)
    .map((item) => ({ id: str(item.id), title: str(item.title), completed: item.completed === true }));
  return subtasks.length > 0 ? subtasks : undefined;
}

export function toTask(record: Row): Task {
  return {
    id: str(record.id),
    title: str(record.title) || "Untitled task",
    description: optStr(record.description),
    status: (str(record.status) || "todo") as Task["status"],
    priority: (str(record.priority) || "medium") as Task["priority"],
    projectId: str(record.project_id),
    dueDate: optStr(record.due_date),
    assigneeId: optStr(record.assignee_id),
    labels: strArray(record.labels),
    subtasks: toSubtasks(record.subtasks),
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at ?? record.created_at),
  };
}

export function toProject(record: Row): Project {
  return {
    id: str(record.id),
    name: str(record.name) || "Untitled project",
    description: str(record.description),
    status: (str(record.status) || "on_track") as Project["status"],
    color: (str(record.color) || "iris") as Project["color"],
    targetDate: optStr(record.target_date),
    memberIds: strArray(record.member_ids),
    archived: record.archived === true,
    createdAt: iso(record.created_at),
  };
}

export function toActivity(record: Row): Activity {
  return {
    id: str(record.id),
    kind: (str(record.kind) || "project_update") as Activity["kind"],
    actorId: optStr(record.actor_id),
    taskId: optStr(record.task_id),
    projectId: optStr(record.project_id),
    message: str(record.message),
    read: record.read === true,
    createdAt: iso(record.created_at),
  };
}

// ---------- List ----------

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toTask);
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toProject);
}

export async function listActivities(): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toActivity);
}

export async function getTask(id: string): Promise<Task | undefined> {
  const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toTask(data as Row) : undefined;
}

// ---------- Write payloads ----------

export function taskPayload(patch: TaskInput): Row {
  const payload: Row = {};
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.description !== undefined) payload.description = patch.description || "";
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.priority !== undefined) payload.priority = patch.priority;
  if (patch.projectId !== undefined) payload.project_id = patch.projectId;
  if (patch.assigneeId !== undefined) payload.assignee_id = patch.assigneeId || null;
  if (patch.dueDate !== undefined) payload.due_date = patch.dueDate || null;
  if (patch.labels !== undefined) payload.labels = patch.labels;
  if (patch.subtasks !== undefined) payload.subtasks = patch.subtasks ?? [];
  return payload;
}

export function projectPayload(patch: ProjectInput): Row {
  const payload: Row = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description || "";
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.targetDate !== undefined) payload.target_date = patch.targetDate || null;
  if (patch.memberIds !== undefined) payload.member_ids = patch.memberIds;
  if (patch.archived !== undefined) payload.archived = patch.archived;
  return payload;
}

export function activityPayload(activity: Activity): Row {
  return {
    kind: activity.kind,
    actor_id: activity.actorId || null,
    task_id: activity.taskId || null,
    project_id: activity.projectId || null,
    message: activity.message,
    read: activity.read,
  };
}

// ---------- Local merges (kept in one place so services stay thin) ----------

/** Same clear-semantics as the old mock: omitted keeps, "" clears. */
export function mergeTask(prev: Task, patch: TaskInput): Task {
  const merged: Task = { ...prev, updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) merged.title = patch.title;
  if (patch.description !== undefined) merged.description = patch.description || undefined;
  if (patch.status !== undefined) merged.status = patch.status;
  if (patch.priority !== undefined) merged.priority = patch.priority;
  if (patch.projectId !== undefined) merged.projectId = patch.projectId;
  if (patch.dueDate !== undefined) merged.dueDate = patch.dueDate || undefined;
  if (patch.assigneeId !== undefined) merged.assigneeId = patch.assigneeId || undefined;
  if (patch.labels !== undefined) merged.labels = patch.labels;
  if (patch.subtasks !== undefined) merged.subtasks = patch.subtasks;
  return merged;
}

export function mergeProject(prev: Project, patch: ProjectInput): Project {
  const merged: Project = { ...prev };
  if (patch.name !== undefined) merged.name = patch.name;
  if (patch.description !== undefined) merged.description = patch.description || "";
  if (patch.status !== undefined) merged.status = patch.status;
  if (patch.color !== undefined) merged.color = patch.color;
  if (patch.targetDate !== undefined) merged.targetDate = patch.targetDate || undefined;
  if (patch.memberIds !== undefined) merged.memberIds = patch.memberIds;
  if (patch.archived !== undefined) merged.archived = patch.archived;
  return merged;
}
