import { z } from "zod";
import { queryOne, execute } from "../db";
import { Role, type UserContext } from "../auth";

export const updateProjectSchema = z.object({
  project_id: z.number().describe("The project ID to update"),
  name: z.string().min(1).max(255).optional().describe("New project name"),
  timezone: z.string().optional().describe("New timezone (e.g. 'UTC', 'America/New_York')"),
});

interface Project {
  id: number;
  deleted_at: string | null;
}

export function updateProject(
  ctx: UserContext,
  params: z.infer<typeof updateProjectSchema>
): object {
  if (ctx.user.role !== Role.ADMIN) {
    return { error: "Admin access required to update projects" };
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

  if (!params.name && !params.timezone) {
    return { error: "Nothing to update — provide name or timezone" };
  }

  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const values: (string | number)[] = [now];

  if (params.name) {
    sets.push("name = ?");
    values.push(params.name);
  }
  if (params.timezone) {
    sets.push("timezone = ?");
    values.push(params.timezone);
  }

  values.push(params.project_id);
  execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, values);

  return {
    success: true,
    project_id: params.project_id,
    updated: {
      ...(params.name ? { name: params.name } : {}),
      ...(params.timezone ? { timezone: params.timezone } : {}),
    },
  };
}
