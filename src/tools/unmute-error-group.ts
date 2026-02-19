import { z } from "zod";
import { queryOne, execute } from "../db";
import type { UserContext } from "../auth";

export const unmuteErrorGroupSchema = z.object({
  group_id: z.number().describe("The error group ID"),
});

interface Group {
  id: number;
  project_id: number;
  muted_at: string | null;
}

export function unmuteErrorGroup(
  ctx: UserContext,
  params: z.infer<typeof unmuteErrorGroupSchema>
): object {
  const group = queryOne<Group>(
    `SELECT id, project_id, muted_at FROM groups WHERE id = ?`,
    [params.group_id]
  );

  if (!group) {
    return { error: "Error group not found" };
  }

  if (!ctx.projectIds.includes(group.project_id)) {
    return { error: "Access denied to this error group" };
  }

  if (!group.muted_at) {
    return { error: "Error group is not muted" };
  }

  const now = new Date().toISOString();
  execute(
    `UPDATE groups SET muted_at = NULL, muted_until = NULL, muter_id = NULL, updated_at = ? WHERE id = ?`,
    [now, params.group_id]
  );

  return { success: true, group_id: params.group_id, status: "open" };
}
