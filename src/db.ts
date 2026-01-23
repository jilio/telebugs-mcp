import { Database, type SQLQueryBindings } from "bun:sqlite";

const dbPath = process.env.TELEBUGS_DB_PATH ?? "/var/lib/docker/volumes/telebugs-data/_data/db/production.sqlite3";

export const db = new Database(dbPath, { readonly: true });

// Enable WAL mode for better concurrent read performance
db.exec("PRAGMA journal_mode = WAL");

export function query<T>(sql: string, params: SQLQueryBindings[] = []): T[] {
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryOne<T>(sql: string, params: SQLQueryBindings[] = []): T | null {
  const stmt = db.prepare(sql);
  return (stmt.get(...params) as T) ?? null;
}
