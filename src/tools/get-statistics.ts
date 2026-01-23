import { z } from "zod";
import { query } from "../db";
import type { UserContext } from "../auth";

export const getStatisticsSchema = z.object({
  project_id: z.number().optional().describe("Filter by project ID"),
  period: z
    .enum(["hour", "day", "week", "month"])
    .default("day")
    .describe("Aggregation period: hour, day, week, or month"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(30)
    .describe("Number of periods to return (1-100, default 30)"),
});

// Period types from Rails enum (matching report_aggregates.period_type)
const PERIOD_TYPE_MAP: Record<string, number> = {
  hour: 0,
  day: 1,
  week: 2,
  month: 3,
};

interface AggregateRow {
  period_key: string;
  total_count: number;
  group_count: number;
}

interface TopGroup {
  group_id: number;
  error_type: string;
  error_message: string;
  count: number;
}

export function getStatistics(
  ctx: UserContext,
  params: z.infer<typeof getStatisticsSchema>
): object {
  const allowedProjectIds =
    params.project_id && ctx.projectIds.includes(params.project_id)
      ? [params.project_id]
      : ctx.projectIds;

  if (allowedProjectIds.length === 0) {
    return { statistics: { periods: [], top_error_groups: [] } };
  }

  const periodType = PERIOD_TYPE_MAP[params.period];
  const placeholders = allowedProjectIds.map(() => "?").join(", ");

  // Get aggregated counts per period
  const aggregates = query<AggregateRow>(
    `SELECT period_key, SUM(count) as total_count, COUNT(DISTINCT group_id) as group_count
     FROM report_aggregates
     WHERE project_id IN (${placeholders}) AND period_type = ?
     GROUP BY period_key
     ORDER BY period_key DESC
     LIMIT ?`,
    [...allowedProjectIds, periodType, params.limit]
  );

  // Get top error groups for the selected projects
  const topGroups = query<TopGroup>(
    `SELECT ra.group_id, g.error_type, g.error_message, SUM(ra.count) as count
     FROM report_aggregates ra
     JOIN groups g ON g.id = ra.group_id
     WHERE ra.project_id IN (${placeholders}) AND ra.period_type = ?
     GROUP BY ra.group_id
     ORDER BY count DESC
     LIMIT 10`,
    [...allowedProjectIds, periodType]
  );

  // Calculate totals
  const totalReports = aggregates.reduce((sum, a) => sum + a.total_count, 0);
  const uniqueGroups = new Set(topGroups.map((g) => g.group_id)).size;

  return {
    statistics: {
      period: params.period,
      total_reports: totalReports,
      unique_error_groups: uniqueGroups,
      periods: aggregates.reverse().map((a) => ({
        period_key: a.period_key,
        report_count: a.total_count,
        error_group_count: a.group_count,
      })),
      top_error_groups: topGroups.map((g) => ({
        group_id: g.group_id,
        error_type: g.error_type,
        error_message: g.error_message,
        count: g.count,
      })),
    },
  };
}
