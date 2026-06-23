import type { UserContext } from "./auth";

// Base URL of the Telebugs REST API, e.g.
// https://telebugs.lookhere.tech/api/telebugs/v1
// When unset, REST-backed tools transparently fall back to direct DB access.
const API_BASE_URL =
  process.env.TELEBUGS_API_BASE_URL?.replace(/\/+$/, "") || null;

export function isRestConfigured(): boolean {
  return API_BASE_URL !== null;
}

export interface RestProject {
  id: number;
  name: string;
  platform: string | null;
  timezone: string;
  token?: string;
  groups_count: number;
  reports_count: number;
  source_repository_url: string | null;
  source_default_branch: string | null;
  created_at: string;
  updated_at: string;
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
}

export class TelebugsApiError extends Error {
  readonly status: number;
  readonly type?: string;

  constructor(status: number, detail: string, type?: string) {
    super(detail);
    this.name = "TelebugsApiError";
    this.status = status;
    this.type = type;
  }
}

export class TelebugsRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json, application/problem+json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      throw new TelebugsApiError(
        0,
        `Could not reach Telebugs API at ${this.baseUrl}: ${
          (cause as Error)?.message ?? String(cause)
        }`
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    let data: unknown;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }

    if (!res.ok) {
      const problem = (data ?? {}) as ProblemDetails;
      throw new TelebugsApiError(
        res.status,
        problem.detail ?? problem.title ?? `HTTP ${res.status}`,
        problem.type
      );
    }

    return data as T;
  }

  // Walks every page of a cursor-paginated collection and concatenates results.
  private async listAll<T>(path: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let cursor: number | null = null;

    do {
      const sep = path.includes("?") ? "&" : "?";
      const qs = `limit=100${cursor !== null ? `&cursor=${cursor}` : ""}`;
      // The response carries both the collection (under `key`) and pagination.
      const page = (await this.request<Record<string, unknown>>(
        "GET",
        `${path}${sep}${qs}`
      )) as { next_cursor: number | null; has_more: boolean } & Record<
        string,
        unknown
      >;

      items.push(...((page[key] as T[] | undefined) ?? []));
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor !== null);

    return items;
  }

  listProjects(): Promise<RestProject[]> {
    return this.listAll<RestProject>("/projects", "projects");
  }

  getProject(id: number): Promise<RestProject> {
    return this.request<RestProject>("GET", `/projects/${id}`);
  }

  createProject(body: {
    name: string;
    platform: string;
    timezone: string;
  }): Promise<RestProject> {
    return this.request<RestProject>("POST", "/projects", body);
  }

  updateProject(
    id: number,
    body: { name?: string; timezone?: string }
  ): Promise<RestProject> {
    return this.request<RestProject>("PATCH", `/projects/${id}`, body);
  }

  deleteProject(id: number): Promise<void> {
    return this.request<void>("DELETE", `/projects/${id}`);
  }

  addProjectUser(id: number, userId: number): Promise<void> {
    return this.request<void>("POST", `/projects/${id}/users`, {
      user_id: userId,
    });
  }

  removeProjectUser(id: number, userId: number): Promise<void> {
    return this.request<void>("DELETE", `/projects/${id}/users/${userId}`);
  }
}

// Returns a REST client for this user, or null when REST is not configured or
// the user has no API key — in which case callers fall back to direct DB access.
export function createRestClient(ctx: UserContext): TelebugsRestClient | null {
  if (!API_BASE_URL || !ctx.apiKey) {
    return null;
  }
  return new TelebugsRestClient(API_BASE_URL, ctx.apiKey);
}

// Maps a thrown REST error into the `{ error }` result shape the tools return.
export function restErrorToResult(
  error: unknown,
  messages: { notFound?: string } = {}
): { error: string } {
  if (error instanceof TelebugsApiError) {
    switch (error.status) {
      case 401:
        return { error: "Telebugs API rejected the API key (unauthorized)" };
      case 403:
        return { error: "Access denied" };
      case 404:
        return { error: messages.notFound ?? "Not found" };
      default:
        return { error: error.message };
    }
  }
  return {
    error: `Telebugs API request failed: ${
      (error as Error)?.message ?? String(error)
    }`,
  };
}
