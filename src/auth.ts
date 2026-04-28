import { query, queryOne } from "./db";

export const Role = {
  MEMBER: 0,
  ADMIN: 1,
  SYSTEM: 2,
} as const;

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

function createUserContext(user: User): UserContext {
  return {
    user,
    get projectIds() {
      const memberships = query<{ project_id: number }>(
        `SELECT project_id FROM project_memberships WHERE user_id = ?`,
        [user.id]
      );
      return memberships.map((m) => m.project_id);
    },
  };
}

export function getUserContextById(userId: number): UserContext | null {
  const user = queryOne<User>(
    `SELECT id, name, email_address, role FROM users WHERE id = ? AND active = 1`,
    [userId]
  );

  return user ? createUserContext(user) : null;
}

export function validateApiKey(apiKey: string): UserContext | null {
  const user = queryOne<User>(
    `SELECT id, name, email_address, role FROM users WHERE api_key = ? AND active = 1`,
    [apiKey]
  );

  return user ? createUserContext(user) : null;
}

let usersTableColumns: Set<string> | null = null;

function getUsersTableColumns(): Set<string> {
  if (!usersTableColumns) {
    const columns = query<{ name: string }>(`PRAGMA table_info(users)`);
    usersTableColumns = new Set(columns.map((column) => column.name));
  }
  return usersTableColumns;
}

export async function validatePasswordCredentials(
  emailAddress: string,
  password: string
): Promise<UserContext | null> {
  if (!getUsersTableColumns().has("password_digest")) {
    return null;
  }

  const user = queryOne<User & { password_digest: string | null }>(
    `SELECT id, name, email_address, role, password_digest
     FROM users
     WHERE lower(email_address) = lower(?) AND active = 1 AND role != ?`,
    [emailAddress, Role.SYSTEM]
  );

  if (!user?.password_digest) {
    return null;
  }

  let passwordMatches = false;
  try {
    passwordMatches = await Bun.password.verify(password, user.password_digest);
  } catch {
    return null;
  }

  return passwordMatches ? createUserContext(user) : null;
}
