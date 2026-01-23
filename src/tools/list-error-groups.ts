import { z } from "zod";
import type { SQLQueryBindings } from "bun:sqlite";
import { query } from "../db";
import type { UserContext } from "../auth";

export const listErrorGroupsSchema = z.object({
  project_id: z.number().optional().describe("Filter by project ID"),
  error_type: z.string().optional().describe("Filter by exact error type"),
  error_message: z.string().optional().describe("Filter by error message (substring match)"),
  status: z
    .enum(["open", "resolved", "muted", "all"])
    .default("open")
    .describe("Filter by status (default: open)"),
  from: z
    .string()
    .optional()
    .describe("Start date (ISO 8601 format, e.g., 2024-01-01)"),
  to: z
    .string()
    .optional()
    .describe("End date (ISO 8601 format, e.g., 2024-12-31)"),
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

interface Group {
  id: number;
  project_id: number;
  project_name: string;
  error_type: string;
  error_message: string;
  culprit: string | null;
  fingerprint: string;
  reports_count: number;
  first_occurred_at: string;
  last_occurred_at: string;
  resolved_at: string | null;
  muted_at: string | null;
}

export function listErrorGroups(
  ctx: UserContext,
  params: z.infer<typeof listErrorGroupsSchema>
): object {
  const allowedProjectIds =
    params.project_id && ctx.projectIds.includes(params.project_id)
      ? [params.project_id]
      : ctx.projectIds;

  if (allowedProjectIds.length === 0) {
    return { error_groups: [] };
  }

  const conditions: string[] = [];
  const queryParams: SQLQueryBindings[] = [];

  const placeholders = allowedProjectIds.map(() => "?").join(", ");
  conditions.push(`g.project_id IN (${placeholders})`);
  queryParams.push(...allowedProjectIds);

  conditions.push(`g.merged_into_id IS NULL`);

  if (params.error_type) {
    conditions.push(`g.error_type = ?`);
    queryParams.push(params.error_type);
  }

  if (params.error_message) {
    conditions.push(`g.error_message LIKE ?`);
    queryParams.push(`%${params.error_message}%`);
  }

  if (params.status === "resolved") {
    conditions.push(`g.resolved_at IS NOT NULL`);
  } else if (params.status === "muted") {
    conditions.push(`g.muted_at IS NOT NULL AND g.resolved_at IS NULL`);
  } else if (params.status === "open") {
    conditions.push(`g.resolved_at IS NULL AND g.muted_at IS NULL`);
  }
  // "all" - no status filter

  if (params.from) {
    conditions.push(`g.last_occurred_at >= ?`);
    queryParams.push(params.from);
  }

  if (params.to) {
    conditions.push(`g.last_occurred_at <= ?`);
    queryParams.push(params.to);
  }

  // Get total count first (without limit/offset)
  const countResult = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM groups g WHERE ${conditions.join(" AND ")}`,
    queryParams
  );
  const totalCount = countResult[0]?.count ?? 0;

  queryParams.push(params.limit, params.offset);

  const groups = query<Group>(
    `SELECT g.id, g.project_id, p.name as project_name, g.error_type, g.error_message,
            g.culprit, g.fingerprint, g.reports_count, g.first_occurred_at,
            g.last_occurred_at, g.resolved_at, g.muted_at
     FROM groups g
     JOIN projects p ON p.id = g.project_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY g.last_occurred_at DESC
     LIMIT ? OFFSET ?`,
    queryParams
  );

  return {
    total_count: totalCount,
    error_groups: groups.map((g) => ({
      id: g.id,
      project_id: g.project_id,
      project_name: g.project_name,
      error_type: g.error_type,
      error_message: g.error_message,
      culprit: g.culprit,
      occurrences: g.reports_count,
      first_seen: g.first_occurred_at,
      last_seen: g.last_occurred_at,
      status: g.resolved_at
        ? "resolved"
        : g.muted_at
          ? "muted"
          : "open",
    })),
  };
}
