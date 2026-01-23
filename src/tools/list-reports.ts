import { z } from "zod";
import type { SQLQueryBindings } from "bun:sqlite";
import { query } from "../db";
import type { UserContext } from "../auth";

export const listReportsSchema = z.object({
  group_id: z.number().optional().describe("Filter by error group ID"),
  project_id: z.number().optional().describe("Filter by project ID"),
  from: z
    .string()
    .optional()
    .describe("Start date (ISO 8601 format)"),
  to: z
    .string()
    .optional()
    .describe("End date (ISO 8601 format)"),
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

interface Report {
  id: number;
  project_id: number;
  project_name: string;
  group_id: number;
  error_type: string;
  error_message: string;
  culprit: string | null;
  environment: string | null;
  platform: string | null;
  release_version: string | null;
  server_name: string | null;
  handled: boolean;
  severity: number;
  occurred_at: string;
}

const SEVERITY_NAMES: Record<number, string> = {
  0: "error",
  1: "warning",
  2: "info",
  3: "debug",
  4: "fatal",
};

export function listReports(
  ctx: UserContext,
  params: z.infer<typeof listReportsSchema>
): object {
  const allowedProjectIds =
    params.project_id && ctx.projectIds.includes(params.project_id)
      ? [params.project_id]
      : ctx.projectIds;

  if (allowedProjectIds.length === 0) {
    return { reports: [] };
  }

  const conditions: string[] = [];
  const queryParams: SQLQueryBindings[] = [];

  const placeholders = allowedProjectIds.map(() => "?").join(", ");
  conditions.push(`r.project_id IN (${placeholders})`);
  queryParams.push(...allowedProjectIds);

  if (params.group_id) {
    conditions.push(`r.group_id = ?`);
    queryParams.push(params.group_id);
  }

  if (params.from) {
    conditions.push(`r.occurred_at >= ?`);
    queryParams.push(params.from);
  }

  if (params.to) {
    conditions.push(`r.occurred_at <= ?`);
    queryParams.push(params.to);
  }

  // Get total count first (without limit/offset)
  const countResult = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM reports r WHERE ${conditions.join(" AND ")}`,
    queryParams
  );
  const totalCount = countResult[0]?.count ?? 0;

  queryParams.push(params.limit, params.offset);

  const reports = query<Report>(
    `SELECT r.id, r.project_id, p.name as project_name, r.group_id, r.error_type,
            r.error_message, r.culprit, r.environment, r.platform, r.release_version,
            r.server_name, r.handled, r.severity, r.occurred_at
     FROM reports r
     JOIN projects p ON p.id = r.project_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.occurred_at DESC
     LIMIT ? OFFSET ?`,
    queryParams
  );

  return {
    total_count: totalCount,
    reports: reports.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      group_id: r.group_id,
      error_type: r.error_type,
      error_message: r.error_message,
      culprit: r.culprit,
      environment: r.environment,
      platform: r.platform,
      release: r.release_version,
      server: r.server_name,
      handled: r.handled,
      severity: SEVERITY_NAMES[r.severity] ?? "unknown",
      occurred_at: r.occurred_at,
    })),
  };
}
