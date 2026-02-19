import { z } from "zod";
import { db, queryOne } from "../db";
import type { UserContext } from "../auth";

export const addNoteSchema = z.object({
  group_id: z.number().describe("The error group ID"),
  content: z.string().min(1).describe("The note content"),
});

interface Group {
  id: number;
  project_id: number;
}

export function addNote(
  ctx: UserContext,
  params: z.infer<typeof addNoteSchema>
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

  const now = new Date().toISOString();

  const insertNote = db.prepare(
    `INSERT INTO notes (group_id, user_id, content, automated, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const incrementCount = db.prepare(
    `UPDATE groups SET notes_count = notes_count + 1, updated_at = ? WHERE id = ?`
  );

  const transaction = db.transaction(() => {
    const result = insertNote.run(params.group_id, ctx.user.id, params.content, 0, now, now);
    incrementCount.run(now, params.group_id);
    return result;
  });

  const result = transaction();

  return {
    success: true,
    note_id: Number(result.lastInsertRowid),
    group_id: params.group_id,
  };
}
