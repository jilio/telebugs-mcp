import { z } from "zod";
import { db, query, queryOne } from "../db";
import type { UserContext } from "../auth";

export const addProjectMemberSchema = z.object({
  project_id: z.number().describe("The project ID"),
  user_id: z.number().describe("The user ID to add"),
});

export const removeProjectMemberSchema = z.object({
  project_id: z.number().describe("The project ID"),
  user_id: z.number().describe("The user ID to remove"),
});

export const listProjectMembersSchema = z.object({
  project_id: z.number().describe("The project ID"),
});

interface Project {
  id: number;
  deleted_at: string | null;
}

interface User {
  id: number;
  name: string;
  email_address: string;
  role: number;
}

interface Membership {
  user_id: number;
  project_id: number;
}

export function addProjectMember(
  ctx: UserContext,
  params: z.infer<typeof addProjectMemberSchema>
): object {
  if (ctx.user.role !== 0) {
    return { error: "Admin access required to manage project members" };
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

  const user = queryOne<User>(
    `SELECT id, name, email_address, role FROM users WHERE id = ? AND active = 1`,
    [params.user_id]
  );

  if (!user) {
    return { error: "User not found or inactive" };
  }

  const existing = queryOne<Membership>(
    `SELECT user_id, project_id FROM project_memberships WHERE project_id = ? AND user_id = ?`,
    [params.project_id, params.user_id]
  );

  if (existing) {
    return { error: "User is already a member of this project" };
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO project_memberships (project_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)`
  ).run(params.project_id, params.user_id, now, now);

  return {
    success: true,
    project_id: params.project_id,
    user_id: params.user_id,
    user_name: user.name,
  };
}

export function removeProjectMember(
  ctx: UserContext,
  params: z.infer<typeof removeProjectMemberSchema>
): object {
  if (ctx.user.role !== 0) {
    return { error: "Admin access required to manage project members" };
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

  const existing = queryOne<Membership>(
    `SELECT user_id, project_id FROM project_memberships WHERE project_id = ? AND user_id = ?`,
    [params.project_id, params.user_id]
  );

  if (!existing) {
    return { error: "User is not a member of this project" };
  }

  db.prepare(
    `DELETE FROM project_memberships WHERE project_id = ? AND user_id = ?`
  ).run(params.project_id, params.user_id);

  return {
    success: true,
    project_id: params.project_id,
    user_id: params.user_id,
    status: "removed",
  };
}

export function listProjectMembers(
  ctx: UserContext,
  params: z.infer<typeof listProjectMembersSchema>
): object {
  if (!ctx.projectIds.includes(params.project_id)) {
    return { error: "Access denied to this project" };
  }

  const project = queryOne<Project>(
    `SELECT id, deleted_at FROM projects WHERE id = ?`,
    [params.project_id]
  );

  if (!project || project.deleted_at) {
    return { error: "Project not found" };
  }

  const members = query<User & { joined_at: string }>(
    `SELECT u.id, u.name, u.email_address, u.role, pm.created_at as joined_at
     FROM users u
     INNER JOIN project_memberships pm ON pm.user_id = u.id
     WHERE pm.project_id = ? AND u.active = 1
     ORDER BY u.name`,
    [params.project_id]
  );

  return {
    project_id: params.project_id,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email_address,
      role: m.role === 0 ? "admin" : "member",
      joined_at: m.joined_at,
    })),
  };
}
