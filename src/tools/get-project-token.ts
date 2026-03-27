import { z } from "zod";
import { queryOne } from "../db";
import type { UserContext } from "../auth";

export const getProjectTokenSchema = z.object({
  project_id: z.number().describe("The project ID"),
});

interface ProjectToken {
  id: number;
  token: string;
  deleted_at: string | null;
}

export function getProjectToken(
  ctx: UserContext,
  params: z.infer<typeof getProjectTokenSchema>
): object {
  if (!ctx.projectIds.includes(params.project_id)) {
    return { error: "Access denied to this project" };
  }

  const project = queryOne<ProjectToken>(
    `SELECT id, token, deleted_at FROM projects WHERE id = ?`,
    [params.project_id]
  );

  if (!project || project.deleted_at) {
    return { error: "Project not found" };
  }

  return {
    project_id: params.project_id,
    token: project.token,
  };
}
