import { z } from "zod";
import { query } from "../db";
import type { UserContext } from "../auth";

export const getSourcemapStatusSchema = z.object({
  debug_id: z.string().describe("The debug ID to look up"),
  project_id: z
    .number()
    .optional()
    .describe("Filter by project ID"),
});

interface ArtifactResult {
  id: number;
  name: string;
  debug_id: string;
  release_version: string;
  release_id: number;
  project_id: number;
  project_name: string;
}

export function getSourcemapStatus(
  ctx: UserContext,
  params: z.infer<typeof getSourcemapStatusSchema>
): object {
  const allowedProjectIds =
    params.project_id && ctx.projectIds.includes(params.project_id)
      ? [params.project_id]
      : ctx.projectIds;

  if (allowedProjectIds.length === 0) {
    return { found: false, artifact: null };
  }

  const placeholders = allowedProjectIds.map(() => "?").join(", ");

  const artifact = query<ArtifactResult>(
    `SELECT a.id, a.name, a.debug_id, r.version as release_version,
            r.id as release_id, r.project_id, p.name as project_name
     FROM artifacts a
     JOIN releases r ON r.id = a.release_id
     JOIN projects p ON p.id = r.project_id
     WHERE a.debug_id = ? AND r.project_id IN (${placeholders})
     LIMIT 1`,
    [params.debug_id, ...allowedProjectIds]
  );

  if (artifact.length === 0) {
    return { found: false, artifact: null };
  }

  const a = artifact[0];
  return {
    found: true,
    artifact: {
      id: a.id,
      name: a.name,
      debug_id: a.debug_id,
      release_version: a.release_version,
      release_id: a.release_id,
      project_id: a.project_id,
      project_name: a.project_name,
    },
  };
}
