import { z } from "zod";
import { query, queryOne } from "../db";
import type { UserContext } from "../auth";

export const getReportSchema = z.object({
  report_id: z.number().describe("The report ID"),
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
  log_message: string | null;
}

interface Backtrace {
  id: number;
  exception_type: string | null;
  exception_module: string | null;
  exception_value: string | null;
}

interface Frame {
  abs_path: string | null;
  filename: string | null;
  function: string | null;
  lineno: number | null;
  colno: number | null;
  context_line: string | null;
  pre_context: string | null;
  post_context: string | null;
  in_app: boolean;
}

interface Context {
  name: string | null;
  data: string | null;
}

interface Tag {
  key: string;
  value: string | null;
}

interface Breadcrumb {
  breadcrumb_type: string | null;
  category: string | null;
  level: string | null;
  message: string | null;
  data: string | null;
  timestamp: string | null;
}

interface RequestInfo {
  url: string | null;
  method: string | null;
  query_string: string | null;
  headers: string | null;
  data: string | null;
}

interface ReportUser {
  user_id: string | null;
  username: string | null;
  email: string | null;
  ip_address: string | null;
  geo_country_code: string | null;
  geo_region: string | null;
  geo_city: string | null;
}

const SEVERITY_NAMES: Record<number, string> = {
  0: "error",
  1: "warning",
  2: "info",
  3: "debug",
  4: "fatal",
};

function safeJsonParse(str: string | null): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

export function getReport(
  ctx: UserContext,
  params: z.infer<typeof getReportSchema>
): object {
  const report = queryOne<Report>(
    `SELECT r.id, r.project_id, p.name as project_name, r.group_id, r.error_type,
            r.error_message, r.culprit, r.environment, r.platform, r.release_version,
            r.server_name, r.handled, r.severity, r.occurred_at, r.log_message
     FROM reports r
     JOIN projects p ON p.id = r.project_id
     WHERE r.id = ?`,
    [params.report_id]
  );

  if (!report) {
    return { error: "Report not found" };
  }

  if (!ctx.projectIds.includes(report.project_id)) {
    return { error: "Access denied to this report" };
  }

  // Fetch backtraces and frames
  const backtraces = query<Backtrace>(
    `SELECT id, exception_type, exception_module, exception_value
     FROM backtraces WHERE report_id = ?`,
    [params.report_id]
  );

  const stackTraces = backtraces.map((bt) => {
    const frames = query<Frame>(
      `SELECT abs_path, filename, function, lineno, colno, context_line,
              pre_context, post_context, in_app
       FROM frames WHERE backtrace_id = ? ORDER BY position`,
      [bt.id]
    );

    return {
      exception_type: bt.exception_type,
      exception_module: bt.exception_module,
      exception_value: bt.exception_value,
      frames: frames.map((f) => ({
        file: f.abs_path ?? f.filename,
        function: f.function,
        line: f.lineno,
        column: f.colno,
        context_line: f.context_line,
        pre_context: safeJsonParse(f.pre_context),
        post_context: safeJsonParse(f.post_context),
        in_app: f.in_app,
      })),
    };
  });

  // Fetch contexts
  const contexts = query<Context>(
    `SELECT name, data FROM contexts WHERE report_id = ?`,
    [params.report_id]
  );

  const contextMap: Record<string, unknown> = {};
  for (const ctx of contexts) {
    if (ctx.name) {
      contextMap[ctx.name] = safeJsonParse(ctx.data);
    }
  }

  // Fetch tags
  const tags = query<Tag>(
    `SELECT key, value FROM tags WHERE report_id = ?`,
    [params.report_id]
  );

  // Fetch breadcrumbs
  const breadcrumbs = query<Breadcrumb>(
    `SELECT breadcrumb_type, category, level, message, data, timestamp
     FROM error_breadcrumbs WHERE report_id = ? ORDER BY timestamp`,
    [params.report_id]
  );

  // Fetch request info
  const request = queryOne<RequestInfo>(
    `SELECT url, method, query_string, headers, data
     FROM requests WHERE report_id = ?`,
    [params.report_id]
  );

  // Fetch user info
  const user = queryOne<ReportUser>(
    `SELECT user_id, username, email, ip_address, geo_country_code, geo_region, geo_city
     FROM report_users WHERE report_id = ?`,
    [params.report_id]
  );

  return {
    report: {
      id: report.id,
      project_id: report.project_id,
      project_name: report.project_name,
      group_id: report.group_id,
      error_type: report.error_type,
      error_message: report.error_message,
      culprit: report.culprit,
      environment: report.environment,
      platform: report.platform,
      release: report.release_version,
      server: report.server_name,
      handled: report.handled,
      severity: SEVERITY_NAMES[report.severity] ?? "unknown",
      occurred_at: report.occurred_at,
      log_message: report.log_message,
      stack_traces: stackTraces,
      contexts: contextMap,
      tags: tags.reduce(
        (acc, t) => {
          acc[t.key] = t.value;
          return acc;
        },
        {} as Record<string, string | null>
      ),
      breadcrumbs: breadcrumbs.map((b) => ({
        type: b.breadcrumb_type,
        category: b.category,
        level: b.level,
        message: b.message,
        data: safeJsonParse(b.data),
        timestamp: b.timestamp,
      })),
      request: request
        ? {
            url: request.url,
            method: request.method,
            query_string: request.query_string,
            headers: safeJsonParse(request.headers),
            data: safeJsonParse(request.data),
          }
        : null,
      user: user
        ? {
            id: user.user_id,
            username: user.username,
            email: user.email,
            ip_address: user.ip_address,
            geo: {
              country: user.geo_country_code,
              region: user.geo_region,
              city: user.geo_city,
            },
          }
        : null,
    },
  };
}
