import { z } from "zod";
import { queryOne, execute } from "../db";
import type { UserContext } from "../auth";

export const muteErrorGroupSchema = z.object({
  group_id: z.number().describe("The error group ID"),
  muted_until: z
    .string()
    .describe("Optional ISO 8601 date until which the group is muted")
    .optional(),
});

interface Group {
  id: number;
  project_id: number;
  resolved_at: string | null;
  muted_at: string | null;
}

export function muteErrorGroup(
  ctx: UserContext,
  params: z.infer<typeof muteErrorGroupSchema>
): object {
  const group = queryOne<Group>(
    `SELECT id, project_id, resolved_at, muted_at FROM groups WHERE id = ?`,
    [params.group_id]
  );

  if (!group) {
    return { error: "Error group not found" };
  }

  if (!ctx.projectIds.includes(group.project_id)) {
    return { error: "Access denied to this error group" };
  }

  if (group.resolved_at) {
    return { error: "Cannot mute a resolved error group" };
  }

  if (group.muted_at) {
    return { error: "Error group is already muted" };
  }

  const now = new Date().toISOString();
  execute(
    `UPDATE groups SET muted_at = ?, muter_id = ?, muted_until = ?, updated_at = ? WHERE id = ?`,
    [now, ctx.user.id, params.muted_until ?? null, now, params.group_id]
  );

  return {
    success: true,
    group_id: params.group_id,
    status: "muted",
    muted_until: params.muted_until ?? null,
  };
}
