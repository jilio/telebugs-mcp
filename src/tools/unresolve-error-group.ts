import { z } from "zod";
import { queryOne, execute } from "../db";
import type { UserContext } from "../auth";

export const unresolveErrorGroupSchema = z.object({
  group_id: z.number().describe("The error group ID"),
});

interface Group {
  id: number;
  project_id: number;
  resolved_at: string | null;
}

export function unresolveErrorGroup(
  ctx: UserContext,
  params: z.infer<typeof unresolveErrorGroupSchema>
): object {
  const group = queryOne<Group>(
    `SELECT id, project_id, resolved_at FROM groups WHERE id = ?`,
    [params.group_id]
  );

  if (!group) {
    return { error: "Error group not found" };
  }

  if (!ctx.projectIds.includes(group.project_id)) {
    return { error: "Access denied to this error group" };
  }

  if (!group.resolved_at) {
    return { error: "Error group is not resolved" };
  }

  const now = new Date().toISOString();
  execute(
    `UPDATE groups SET resolved_at = NULL, resolver_id = NULL, updated_at = ? WHERE id = ?`,
    [now, params.group_id]
  );

  return { success: true, group_id: params.group_id, status: "open" };
}
