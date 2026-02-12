import { z } from "zod";
import { query } from "../db";
import type { UserContext } from "../auth";

export const listReleasesSchema = z.object({
  project_id: z.number().describe("Filter by project ID"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of results (1-100, default 20)"),
  offset: z
    .number()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
});

interface Release {
  id: number;
  project_id: number;
  project_name: string;
  version: string;
  artifacts_count: number;
  created_at: string;
}

export function listReleases(
  ctx: UserContext,
  params: z.infer<typeof listReleasesSchema>
): object {
  if (!ctx.projectIds.includes(params.project_id)) {
    return { error: "Access denied to this project" };
  }

  const countResult = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM releases r WHERE r.project_id = ?`,
    [params.project_id]
  );
  const totalCount = countResult[0]?.count ?? 0;

  const releases = query<Release>(
    `SELECT r.id, r.project_id, p.name as project_name, r.version,
            COUNT(a.id) as artifacts_count, r.created_at
     FROM releases r
     JOIN projects p ON p.id = r.project_id
     LEFT JOIN artifacts a ON a.release_id = r.id
     WHERE r.project_id = ?
     GROUP BY r.id
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    [params.project_id, params.limit, params.offset]
  );

  return {
    total_count: totalCount,
    releases: releases.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      version: r.version,
      artifacts_count: r.artifacts_count,
      created_at: r.created_at,
    })),
  };
}
