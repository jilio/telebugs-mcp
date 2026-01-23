import { z } from "zod";
import { query } from "../db";
import type { UserContext } from "../auth";

export const listProjectsSchema = z.object({});

interface Project {
  id: number;
  name: string;
  platform: number;
  timezone: string;
  groups_count: number;
  reports_count: number;
  created_at: string;
}

const PLATFORM_NAMES: Record<number, string> = {
  0: "ruby",
  1: "javascript",
  2: "python",
  3: "go",
  4: "java",
  5: "php",
  6: "dotnet",
  7: "elixir",
  8: "rust",
  9: "other",
};

export function listProjects(ctx: UserContext): object {
  if (ctx.projectIds.length === 0) {
    return { projects: [] };
  }

  const placeholders = ctx.projectIds.map(() => "?").join(", ");
  const projects = query<Project>(
    `SELECT id, name, platform, timezone, groups_count, reports_count, created_at
     FROM projects
     WHERE id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY name`,
    ctx.projectIds
  );

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      platform: PLATFORM_NAMES[p.platform] ?? "unknown",
      timezone: p.timezone,
      error_groups_count: p.groups_count,
      reports_count: p.reports_count,
      created_at: p.created_at,
    })),
  };
}
