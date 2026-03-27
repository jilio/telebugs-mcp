import { z } from "zod";
import { randomBytes } from "node:crypto";
import { queryOne, execute } from "../db";
import type { UserContext } from "../auth";

export const regenerateProjectTokenSchema = z.object({
  project_id: z.number().describe("The project ID to regenerate the token for"),
});

interface Project {
  id: number;
  deleted_at: string | null;
}

export function regenerateProjectToken(
  ctx: UserContext,
  params: z.infer<typeof regenerateProjectTokenSchema>
): object {
  if (ctx.user.role !== 0) {
    return { error: "Admin access required to regenerate project tokens" };
  }

  const project = queryOne<Project>(
    `SELECT id, deleted_at FROM projects WHERE id = ?`,
    [params.project_id]
  );

  if (!project || project.deleted_at) {
    return { error: "Project not found" };
  }

  if (!ctx.projectIds.includes(params.project_id)) {
    return { error: "Access denied to this project" };
  }

  const now = new Date().toISOString();
  const token = randomBytes(32).toString("hex");

  execute(
    `UPDATE projects SET token = ?, updated_at = ? WHERE id = ?`,
    [token, now, params.project_id]
  );

  return {
    success: true,
    project_id: params.project_id,
    token,
    warning: "Old token is now invalid. Update your application config.",
  };
}
