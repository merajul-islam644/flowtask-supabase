import { supabase } from "@/lib/supabase/client";
import { sessionUserId } from "@/services/supabaseData";
import type { BoardColumn } from "@/types";

/**
 * Custom board-column repository over Supabase. The five built-in columns are
 * hard-coded in the app (see lib/meta); only user-created columns live in the
 * board_columns table, referenced from Task.status by their `column_id`.
 * The board's full sequence (customs interleaved with the built-ins) is one
 * extra row per user whose column_id is `__layout__` and whose label is a
 * JSON array of ids — the same convention the gateway adapter used.
 */

const LAYOUT_ID = "__layout__";

interface ColumnRow {
  id: string;
  columnId: string;
  label: string;
  order: number;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function listColumnRows(): Promise<ColumnRow[]> {
  const { data, error } = await supabase
    .from("board_columns")
    .select("id, column_id, label, sort_order")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: str(record.id),
      columnId: str(record.column_id),
      label: str(record.label),
      order: num(record.sort_order),
    };
  });
}

/** One read returns the real columns plus the persisted layout. */
export async function loadBoard(): Promise<{ columns: BoardColumn[]; order: string[] }> {
  const rows = await listColumnRows();
  const columns = rows
    .filter((row) => row.columnId && row.label && row.columnId !== LAYOUT_ID)
    .map((row) => ({
      id: row.columnId,
      label: row.label,
      order: row.order,
      itemId: row.id || undefined,
    }));
  const layoutRow = rows.find((row) => row.columnId === LAYOUT_ID);
  let order: string[] = [];
  if (layoutRow?.label) {
    try {
      const parsed: unknown = JSON.parse(layoutRow.label);
      if (Array.isArray(parsed)) order = parsed.filter((id): id is string => typeof id === "string");
    } catch {
      order = [];
    }
  }
  return { columns, order };
}

/** Persist the board's column sequence. */
export async function saveColumnOrder(ids: string[]): Promise<void> {
  const rows = await listColumnRows();
  const layoutRow = rows.find((row) => row.columnId === LAYOUT_ID);
  const label = JSON.stringify(ids);
  if (layoutRow?.id) {
    const { error } = await supabase.from("board_columns").update({ label }).eq("id", layoutRow.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("board_columns")
    .insert({ user_id: await sessionUserId(), column_id: LAYOUT_ID, label, sort_order: 0 });
  if (error) throw new Error(error.message);
}

/** Insert the column row and return its database id so the store can keep it
    as the column's `itemId` — without it, a later rename/delete would silently
    skip the database write and resurrect the column on the next reload. */
export async function createColumn(column: BoardColumn): Promise<string> {
  const { data, error } = await supabase
    .from("board_columns")
    .insert({
      user_id: await sessionUserId(),
      column_id: column.id,
      label: column.label,
      sort_order: column.order,
    })
    .select("id")
    .single();
  // A failed create would leave the board out of sync with the database —
  // surface it instead of keeping a phantom column in local state.
  if (error) throw new Error(error.message);
  return str((data as Record<string, unknown> | null)?.id);
}

export async function updateColumn(itemId: string, patch: { label?: string; order?: number }): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.label !== undefined) values.label = patch.label;
  if (patch.order !== undefined) values.sort_order = patch.order;
  const { error } = await supabase.from("board_columns").update(values).eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function deleteColumn(itemId: string): Promise<void> {
  const { error } = await supabase.from("board_columns").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}
