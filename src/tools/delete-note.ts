import { z } from "zod";
import { db, queryOne } from "../db";
import type { UserContext } from "../auth";

export const deleteNoteSchema = z.object({
  group_id: z.number().describe("The error group ID"),
  note_id: z.number().describe("The note ID to delete"),
});

interface Group {
  id: number;
  project_id: number;
}

interface Note {
  id: number;
  user_id: number;
}

export function deleteNote(
  ctx: UserContext,
  params: z.infer<typeof deleteNoteSchema>
): object {
  const group = queryOne<Group>(
    `SELECT id, project_id FROM groups WHERE id = ?`,
    [params.group_id]
  );

  if (!group) {
    return { error: "Error group not found" };
  }

  if (!ctx.projectIds.includes(group.project_id)) {
    return { error: "Access denied to this error group" };
  }

  const note = queryOne<Note>(
    `SELECT id, user_id FROM notes WHERE id = ? AND group_id = ?`,
    [params.note_id, params.group_id]
  );

  if (!note) {
    return { error: "Note not found" };
  }

  if (note.user_id !== ctx.user.id) {
    return { error: "You can only delete your own notes" };
  }

  const now = new Date().toISOString();

  const deleteStmt = db.prepare(`DELETE FROM notes WHERE id = ?`);
  const decrementCount = db.prepare(
    `UPDATE groups SET notes_count = notes_count - 1, updated_at = ? WHERE id = ?`
  );

  const transaction = db.transaction(() => {
    deleteStmt.run(params.note_id);
    decrementCount.run(now, params.group_id);
  });

  transaction();

  return { success: true, note_id: params.note_id, group_id: params.group_id };
}
