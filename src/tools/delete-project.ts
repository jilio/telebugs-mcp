import { z } from "zod";
import { queryOne, execute } from "../db";
import { Role, type UserContext } from "../auth";

export const deleteProjectSchema = z.object({
  project_id: z.number().describe("The project ID to delete"),
});

interface Project {
  id: number;
  name: string;
  deleted_at: string | null;
}

export function deleteProject(
  ctx: UserContext,
  params: z.infer<typeof deleteProjectSchema>
): object {
  if (ctx.user.role !== Role.ADMIN) {
    return { error: "Admin access required to delete projects" };
  }

  const project = queryOne<Project>(
    `SELECT id, name, deleted_at FROM projects WHERE id = ?`,
    [params.project_id]
  );

  if (!project || project.deleted_at) {
    return { error: "Project not found" };
  }

  if (!ctx.projectIds.includes(params.project_id)) {
    return { error: "Access denied to this project" };
  }

  const now = new Date().toISOString();
  execute(
    `UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [now, now, params.project_id]
  );

  return {
    success: true,
    project_id: params.project_id,
    name: project.name,
    status: "deleted",
  };
}
