import { z } from "zod";
import { query } from "../db";
import type { UserContext } from "../auth";

export const searchErrorsSchema = z.object({
  query: z.string().min(1).describe("Search query for error type or message"),
  project_id: z.number().optional().describe("Filter by project ID"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of results (1-100, default 20)"),
});

interface GroupResult {
  id: number;
  project_id: number;
  project_name: string;
  error_type: string;
  error_message: string;
  culprit: string | null;
  reports_count: number;
  last_occurred_at: string;
  resolved_at: string | null;
  muted_at: string | null;
}

export function searchErrors(
  ctx: UserContext,
  params: z.infer<typeof searchErrorsSchema>
): object {
  const allowedProjectIds =
    params.project_id && ctx.projectIds.includes(params.project_id)
      ? [params.project_id]
      : ctx.projectIds;

  if (allowedProjectIds.length === 0) {
    return { results: [] };
  }

  const placeholders = allowedProjectIds.map(() => "?").join(", ");

  // Use FTS5 for full-text search on group_search_index
  // The FTS table has columns: error_type, error_message, culprit
  const groups = query<GroupResult>(
    `SELECT g.id, g.project_id, p.name as project_name, g.error_type, g.error_message,
            g.culprit, g.reports_count, g.last_occurred_at, g.resolved_at, g.muted_at
     FROM groups g
     JOIN projects p ON p.id = g.project_id
     WHERE g.id IN (SELECT rowid FROM group_search_index WHERE group_search_index MATCH ?)
       AND g.project_id IN (${placeholders}) AND g.merged_into_id IS NULL
     ORDER BY g.last_occurred_at DESC
     LIMIT ?`,
    [params.query, ...allowedProjectIds, params.limit]
  );

  return {
    results: groups.map((g) => ({
      id: g.id,
      project_id: g.project_id,
      project_name: g.project_name,
      error_type: g.error_type,
      error_message: g.error_message,
      culprit: g.culprit,
      occurrences: g.reports_count,
      last_seen: g.last_occurred_at,
      status: g.resolved_at
        ? "resolved"
        : g.muted_at
          ? "muted"
          : "open",
    })),
  };
}
