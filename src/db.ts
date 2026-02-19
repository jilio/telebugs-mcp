import { Database, type SQLQueryBindings } from "bun:sqlite";

const dbPath = process.env.TELEBUGS_DB_PATH ?? "/var/lib/docker/volumes/telebugs-data/_data/db/production.sqlite3";

export const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.exec("PRAGMA journal_mode = WAL");
// Retry writes for up to 5s if the Rails app holds a lock
db.exec("PRAGMA busy_timeout = 5000");

export function query<T>(sql: string, params: SQLQueryBindings[] = []): T[] {
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryOne<T>(sql: string, params: SQLQueryBindings[] = []): T | null {
  const stmt = db.prepare(sql);
  return (stmt.get(...params) as T) ?? null;
}

export function execute(sql: string, params: SQLQueryBindings[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}
