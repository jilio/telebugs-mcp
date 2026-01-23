import { z } from "zod";
import { query, queryOne } from "../db";
import type { UserContext } from "../auth";

export const getErrorGroupSchema = z.object({
  group_id: z.number().describe("The error group ID"),
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
  muted_until: string | null;
  notes_count: number;
  owner_name: string | null;
  resolver_name: string | null;
  muter_name: string | null;
}

interface Note {
  id: number;
  content: string;
  automated: boolean;
  user_name: string;
  created_at: string;
}

export function getErrorGroup(
  ctx: UserContext,
  params: z.infer<typeof getErrorGroupSchema>
): object {
  const group = queryOne<Group>(
    `SELECT g.id, g.project_id, p.name as project_name, g.error_type, g.error_message,
            g.culprit, g.fingerprint, g.reports_count, g.first_occurred_at,
            g.last_occurred_at, g.resolved_at, g.muted_at, g.muted_until, g.notes_count,
            owner.name as owner_name, resolver.name as resolver_name, muter.name as muter_name
     FROM groups g
     JOIN projects p ON p.id = g.project_id
     LEFT JOIN users owner ON owner.id = g.owner_id
     LEFT JOIN users resolver ON resolver.id = g.resolver_id
     LEFT JOIN users muter ON muter.id = g.muter_id
     WHERE g.id = ?`,
    [params.group_id]
  );

  if (!group) {
    return { error: "Error group not found" };
  }

  if (!ctx.projectIds.includes(group.project_id)) {
    return { error: "Access denied to this error group" };
  }

  const notes = query<Note>(
    `SELECT n.id, n.content, n.automated, u.name as user_name, n.created_at
     FROM notes n
     JOIN users u ON u.id = n.user_id
     WHERE n.group_id = ?
     ORDER BY n.created_at DESC
     LIMIT 10`,
    [params.group_id]
  );

  return {
    error_group: {
      id: group.id,
      project_id: group.project_id,
      project_name: group.project_name,
      error_type: group.error_type,
      error_message: group.error_message,
      culprit: group.culprit,
      fingerprint: group.fingerprint,
      occurrences: group.reports_count,
      first_seen: group.first_occurred_at,
      last_seen: group.last_occurred_at,
      status: group.resolved_at
        ? "resolved"
        : group.muted_at
          ? "muted"
          : "open",
      resolved_at: group.resolved_at,
      resolved_by: group.resolver_name,
      muted_at: group.muted_at,
      muted_until: group.muted_until,
      muted_by: group.muter_name,
      assigned_to: group.owner_name,
      notes: notes.map((n) => ({
        id: n.id,
        content: n.content,
        automated: n.automated,
        author: n.user_name,
        created_at: n.created_at,
      })),
    },
  };
}
