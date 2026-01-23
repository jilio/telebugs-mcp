import { query, queryOne } from "./db";

export interface User {
  id: number;
  name: string;
  email_address: string;
  role: number;
}

export interface UserContext {
  user: User;
  projectIds: number[];
}

export function validateApiKey(apiKey: string): UserContext | null {
  const user = queryOne<User>(
    `SELECT id, name, email_address, role FROM users WHERE api_key = ? AND active = 1`,
    [apiKey]
  );

  if (!user) {
    return null;
  }

  const memberships = query<{ project_id: number }>(
    `SELECT project_id FROM project_memberships WHERE user_id = ?`,
    [user.id]
  );

  return {
    user,
    projectIds: memberships.map((m) => m.project_id),
  };
}

export function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
