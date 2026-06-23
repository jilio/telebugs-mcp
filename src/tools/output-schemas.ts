import { z } from "zod";

// Output schemas describing each tool's SUCCESS result shape. Failures are
// returned as `{ error }` and surfaced via `isError: true` (no structured
// content), so error shapes are intentionally absent here.
//
// Note: SQLite has no native boolean — `bun:sqlite` returns boolean columns as
// 0/1 integers, so DB-sourced flags use `dbBool` rather than `z.boolean()`.

const groupStatus = z.enum(["open", "resolved", "muted"]);
const severity = z.enum([
  "error",
  "warning",
  "info",
  "debug",
  "fatal",
  "unknown",
]);
const dbBool = z
  .union([z.boolean(), z.number()])
  .describe("Boolean flag (0/1 from the database, or true/false)");

// --- Projects -------------------------------------------------------------

export const listProjectsOutputSchema = z.object({
  projects: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      platform: z.string(),
      timezone: z.string(),
      error_groups_count: z.number(),
      reports_count: z.number(),
      created_at: z.string(),
    })
  ),
});

export const createProjectOutputSchema = z.object({
  success: z.boolean(),
  project: z.object({
    id: z.number(),
    name: z.string(),
    platform: z.string(),
    timezone: z.string(),
    token: z.string().optional(),
  }),
});

export const updateProjectOutputSchema = z.object({
  success: z.boolean(),
  project_id: z.number(),
  updated: z.object({
    name: z.string().optional(),
    timezone: z.string().optional(),
  }),
});

export const deleteProjectOutputSchema = z.object({
  success: z.boolean(),
  project_id: z.number(),
  name: z.string().optional(),
  status: z.string(),
});

export const getProjectTokenOutputSchema = z.object({
  project_id: z.number(),
  token: z.string().optional(),
});

export const regenerateProjectTokenOutputSchema = z.object({
  success: z.boolean(),
  project_id: z.number(),
  token: z.string(),
  warning: z.string(),
});

export const addProjectMemberOutputSchema = z.object({
  success: z.boolean(),
  project_id: z.number(),
  user_id: z.number(),
  user_name: z.string().optional(),
});

export const removeProjectMemberOutputSchema = z.object({
  success: z.boolean(),
  project_id: z.number(),
  user_id: z.number(),
  status: z.string(),
});

export const listProjectMembersOutputSchema = z.object({
  project_id: z.number(),
  members: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
      role: z.enum(["admin", "member"]),
      joined_at: z.string(),
    })
  ),
});

export const listPlatformsOutputSchema = z.object({
  platforms: z.array(z.string()),
});

// --- Error groups ---------------------------------------------------------

export const listErrorGroupsOutputSchema = z.object({
  total_count: z.number().optional(),
  error_groups: z.array(
    z.object({
      id: z.number(),
      project_id: z.number(),
      project_name: z.string(),
      error_type: z.string(),
      error_message: z.string(),
      culprit: z.string().nullable(),
      occurrences: z.number(),
      first_seen: z.string(),
      last_seen: z.string(),
      status: groupStatus,
    })
  ),
});

export const getErrorGroupOutputSchema = z.object({
  error_group: z.object({
    id: z.number(),
    project_id: z.number(),
    project_name: z.string(),
    error_type: z.string(),
    error_message: z.string(),
    culprit: z.string().nullable(),
    fingerprint: z.string(),
    occurrences: z.number(),
    first_seen: z.string(),
    last_seen: z.string(),
    status: groupStatus,
    resolved_at: z.string().nullable(),
    resolved_by: z.string().nullable(),
    muted_at: z.string().nullable(),
    muted_until: z.string().nullable(),
    muted_by: z.string().nullable(),
    assigned_to: z.string().nullable(),
    notes: z.array(
      z.object({
        id: z.number(),
        content: z.string(),
        automated: dbBool,
        author: z.string(),
        created_at: z.string(),
      })
    ),
  }),
});

export const searchErrorsOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      project_id: z.number(),
      project_name: z.string(),
      error_type: z.string(),
      error_message: z.string(),
      culprit: z.string().nullable(),
      occurrences: z.number(),
      last_seen: z.string(),
      status: groupStatus,
    })
  ),
});

const writeStatusResult = z.object({
  success: z.boolean(),
  group_id: z.number(),
  status: z.string(),
});

export const resolveErrorGroupOutputSchema = writeStatusResult;
export const unresolveErrorGroupOutputSchema = writeStatusResult;
export const unmuteErrorGroupOutputSchema = writeStatusResult;
export const muteErrorGroupOutputSchema = z.object({
  success: z.boolean(),
  group_id: z.number(),
  status: z.string(),
  muted_until: z.string().nullable(),
});

// --- Notes ----------------------------------------------------------------

export const addNoteOutputSchema = z.object({
  success: z.boolean(),
  note_id: z.number(),
  group_id: z.number(),
});

export const deleteNoteOutputSchema = z.object({
  success: z.boolean(),
  note_id: z.number(),
  group_id: z.number(),
});

// --- Reports --------------------------------------------------------------

export const listReportsOutputSchema = z.object({
  total_count: z.number().optional(),
  reports: z.array(
    z.object({
      id: z.number(),
      project_id: z.number(),
      project_name: z.string(),
      group_id: z.number(),
      error_type: z.string(),
      error_message: z.string(),
      culprit: z.string().nullable(),
      environment: z.string().nullable(),
      platform: z.string().nullable(),
      release: z.string().nullable(),
      server: z.string().nullable(),
      handled: dbBool,
      severity,
      occurred_at: z.string(),
    })
  ),
});

const reportFrame = z.object({
  file: z.string().nullable(),
  function: z.string().nullable(),
  line: z.number().nullable(),
  column: z.number().nullable(),
  context_line: z.string().nullable(),
  pre_context: z.unknown(),
  post_context: z.unknown(),
  in_app: dbBool,
});

const stackTrace = z.object({
  exception_type: z.string().nullable(),
  exception_module: z.string().nullable(),
  exception_value: z.string().nullable(),
  frames: z.array(reportFrame),
});

const breadcrumb = z.object({
  type: z.string().nullable(),
  category: z.string().nullable(),
  level: z.string().nullable(),
  message: z.string().nullable(),
  data: z.unknown(),
  timestamp: z.string().nullable(),
});

export const getReportOutputSchema = z.object({
  report: z.object({
    id: z.number(),
    project_id: z.number(),
    project_name: z.string(),
    group_id: z.number(),
    error_type: z.string(),
    error_message: z.string(),
    culprit: z.string().nullable(),
    environment: z.string().nullable(),
    platform: z.string().nullable(),
    release: z.string().nullable(),
    server: z.string().nullable(),
    handled: dbBool,
    severity,
    occurred_at: z.string(),
    log_message: z.string().nullable(),
    stack_traces: z.array(stackTrace),
    contexts: z.record(z.unknown()),
    tags: z.record(z.string().nullable()),
    breadcrumbs: z.array(breadcrumb),
    request: z
      .object({
        url: z.string().nullable(),
        method: z.string().nullable(),
        query_string: z.string().nullable(),
        headers: z.unknown(),
        data: z.unknown(),
      })
      .nullable(),
    user: z
      .object({
        id: z.string().nullable(),
        username: z.string().nullable(),
        email: z.string().nullable(),
        ip_address: z.string().nullable(),
        geo: z.object({
          country: z.string().nullable(),
          region: z.string().nullable(),
          city: z.string().nullable(),
        }),
      })
      .nullable(),
  }),
});

// --- Statistics -----------------------------------------------------------

export const getStatisticsOutputSchema = z.object({
  statistics: z.object({
    period: z.string().optional(),
    total_reports: z.number().optional(),
    unique_error_groups: z.number().optional(),
    periods: z.array(
      z.object({
        period_key: z.string(),
        report_count: z.number(),
        error_group_count: z.number(),
      })
    ),
    top_error_groups: z.array(
      z.object({
        group_id: z.number(),
        error_type: z.string(),
        error_message: z.string(),
        count: z.number(),
      })
    ),
  }),
});

// --- Releases & sourcemaps ------------------------------------------------

export const listReleasesOutputSchema = z.object({
  total_count: z.number(),
  releases: z.array(
    z.object({
      id: z.number(),
      project_id: z.number(),
      project_name: z.string(),
      version: z.string(),
      artifacts_count: z.number(),
      created_at: z.string(),
    })
  ),
});

export const listReleaseArtifactsOutputSchema = z.object({
  total_count: z.number(),
  artifacts: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      debug_id: z.string().nullable(),
      byte_size: z.number().nullable(),
      content_type: z.string().nullable(),
      created_at: z.string(),
    })
  ),
});

export const getSourcemapStatusOutputSchema = z.object({
  found: z.boolean(),
  artifact: z
    .object({
      id: z.number(),
      name: z.string(),
      debug_id: z.string(),
      release_version: z.string(),
      release_id: z.number(),
      project_id: z.number(),
      project_name: z.string(),
    })
    .nullable(),
});
