import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { UserContext } from "./auth";
import {
  extractBearerToken,
  getMcpResource,
  registerOAuthRoutes,
  setOAuthChallenge,
  validateBearerToken,
} from "./oauth";

import { listProjectsSchema, listProjects } from "./tools/list-projects";
import {
  listErrorGroupsSchema,
  listErrorGroups,
} from "./tools/list-error-groups";
import { getErrorGroupSchema, getErrorGroup } from "./tools/get-error-group";
import { listReportsSchema, listReports } from "./tools/list-reports";
import { getReportSchema, getReport } from "./tools/get-report";
import { getStatisticsSchema, getStatistics } from "./tools/get-statistics";
import { searchErrorsSchema, searchErrors } from "./tools/search-errors";
import { listReleasesSchema, listReleases } from "./tools/list-releases";
import {
  listReleaseArtifactsSchema,
  listReleaseArtifacts,
} from "./tools/list-release-artifacts";
import {
  getSourcemapStatusSchema,
  getSourcemapStatus,
} from "./tools/get-sourcemap-status";
import {
  resolveErrorGroupSchema,
  resolveErrorGroup,
} from "./tools/resolve-error-group";
import {
  unresolveErrorGroupSchema,
  unresolveErrorGroup,
} from "./tools/unresolve-error-group";
import {
  muteErrorGroupSchema,
  muteErrorGroup,
} from "./tools/mute-error-group";
import {
  unmuteErrorGroupSchema,
  unmuteErrorGroup,
} from "./tools/unmute-error-group";
import { addNoteSchema, addNote } from "./tools/add-note";
import { deleteNoteSchema, deleteNote } from "./tools/delete-note";
import {
  createProjectSchema,
  createProject,
} from "./tools/create-project";
import {
  updateProjectSchema,
  updateProject,
} from "./tools/update-project";
import {
  deleteProjectSchema,
  deleteProject,
} from "./tools/delete-project";
import {
  getProjectTokenSchema,
  getProjectToken,
} from "./tools/get-project-token";
import {
  regenerateProjectTokenSchema,
  regenerateProjectToken,
} from "./tools/regenerate-project-token";
import {
  addProjectMemberSchema,
  addProjectMember,
  removeProjectMemberSchema,
  removeProjectMember,
  listProjectMembersSchema,
  listProjectMembers,
} from "./tools/manage-project-members";
import {
  listPlatformsSchema,
  listPlatforms,
} from "./tools/list-platforms";

const PORT = parseInt(process.env.PORT ?? "3100", 10);

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
registerOAuthRoutes(app);

type McpTransport = StreamableHTTPServerTransport | SSEServerTransport;

// Store transports and user contexts by session ID
const transports: Record<string, McpTransport> = {};
const sessionContexts: Record<string, UserContext> = {};

function deleteSession(sessionId: string) {
  delete transports[sessionId];
  delete sessionContexts[sessionId];
}

function sendMcpJsonError(
  res: Response,
  status: number,
  code: number,
  message: string
) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function rejectUnauthorized(req: Request, res: Response, message: string) {
  setOAuthChallenge(req, res);
  sendMcpJsonError(res, 401, -32001, message);
}

function getAuthorizedUserContext(
  req: Request,
  res: Response
): UserContext | null {
  const bearerToken = extractBearerToken(req.headers.authorization);
  if (!bearerToken) {
    rejectUnauthorized(req, res, "Authorization required");
    return null;
  }

  const userContext = validateBearerToken(bearerToken, getMcpResource(req));
  if (!userContext) {
    rejectUnauthorized(req, res, "Invalid or expired bearer token");
    return null;
  }

  return userContext;
}

function requestMatchesSessionUser(
  sessionId: string,
  userContext: UserContext
): boolean {
  return sessionContexts[sessionId]?.user.id === userContext.user.id;
}

function getQuerySessionId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function createServer(userContext: UserContext): McpServer {
  const server = new McpServer({
    name: "telebugs-mcp",
    version: "1.0.0",
  });

  // Register all tools - each tool closure captures the userContext
  server.tool(
    "list_projects",
    "List all projects accessible to the authenticated user",
    listProjectsSchema.shape,
    async () => {
      const result = listProjects(userContext);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "list_error_groups",
    "List deduplicated error groups with optional filtering by project, status, and date range",
    listErrorGroupsSchema.shape,
    async (params) => {
      const validated = listErrorGroupsSchema.parse(params);
      const result = listErrorGroups(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "get_error_group",
    "Get detailed information about a specific error group including notes",
    getErrorGroupSchema.shape,
    async (params) => {
      const validated = getErrorGroupSchema.parse(params);
      const result = getErrorGroup(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "list_reports",
    "List individual error occurrences with optional filtering",
    listReportsSchema.shape,
    async (params) => {
      const validated = listReportsSchema.parse(params);
      const result = listReports(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "get_report",
    "Get full details of a specific error report including stack trace, breadcrumbs, and context",
    getReportSchema.shape,
    async (params) => {
      const validated = getReportSchema.parse(params);
      const result = getReport(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "get_statistics",
    "Get aggregated error statistics over time with optional project filtering",
    getStatisticsSchema.shape,
    async (params) => {
      const validated = getStatisticsSchema.parse(params);
      const result = getStatistics(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "search_errors",
    "Full-text search across error types and messages",
    searchErrorsSchema.shape,
    async (params) => {
      const validated = searchErrorsSchema.parse(params);
      const result = searchErrors(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "list_releases",
    "List all releases for a project with artifact counts",
    listReleasesSchema.shape,
    async (params) => {
      const validated = listReleasesSchema.parse(params);
      const result = listReleases(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "list_release_artifacts",
    "List uploaded artifacts for a release",
    listReleaseArtifactsSchema.shape,
    async (params) => {
      const validated = listReleaseArtifactsSchema.parse(params);
      const result = listReleaseArtifacts(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "get_sourcemap_status",
    "Check if a debug ID has sourcemaps available",
    getSourcemapStatusSchema.shape,
    async (params) => {
      const validated = getSourcemapStatusSchema.parse(params);
      const result = getSourcemapStatus(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "resolve_error_group",
    "Resolve an error group (mark as fixed)",
    resolveErrorGroupSchema.shape,
    async (params) => {
      const validated = resolveErrorGroupSchema.parse(params);
      const result = resolveErrorGroup(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "unresolve_error_group",
    "Reopen a resolved error group",
    unresolveErrorGroupSchema.shape,
    async (params) => {
      const validated = unresolveErrorGroupSchema.parse(params);
      const result = unresolveErrorGroup(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "mute_error_group",
    "Mute an error group with optional expiry date",
    muteErrorGroupSchema.shape,
    async (params) => {
      const validated = muteErrorGroupSchema.parse(params);
      const result = muteErrorGroup(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "unmute_error_group",
    "Unmute a muted error group",
    unmuteErrorGroupSchema.shape,
    async (params) => {
      const validated = unmuteErrorGroupSchema.parse(params);
      const result = unmuteErrorGroup(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "add_note",
    "Add a note to an error group",
    addNoteSchema.shape,
    async (params) => {
      const validated = addNoteSchema.parse(params);
      const result = addNote(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "delete_note",
    "Delete a note from an error group (author only)",
    deleteNoteSchema.shape,
    async (params) => {
      const validated = deleteNoteSchema.parse(params);
      const result = deleteNote(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "create_project",
    "Create a new project (admin only). Use list_platforms to see available platform names.",
    createProjectSchema.shape,
    async (params) => {
      const validated = createProjectSchema.parse(params);
      const result = createProject(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "update_project",
    "Update a project's name or timezone (admin only)",
    updateProjectSchema.shape,
    async (params) => {
      const validated = updateProjectSchema.parse(params);
      const result = updateProject(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "delete_project",
    "Soft-delete a project (admin only). This is irreversible.",
    deleteProjectSchema.shape,
    async (params) => {
      const validated = deleteProjectSchema.parse(params);
      const result = deleteProject(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "get_project_token",
    "Get the token/DSN for a project to configure error reporting in your app",
    getProjectTokenSchema.shape,
    async (params) => {
      const validated = getProjectTokenSchema.parse(params);
      const result = getProjectToken(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "regenerate_project_token",
    "Regenerate a project's token (admin only). The old token becomes invalid immediately.",
    regenerateProjectTokenSchema.shape,
    async (params) => {
      const validated = regenerateProjectTokenSchema.parse(params);
      const result = regenerateProjectToken(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "add_project_member",
    "Add a user to a project (admin only)",
    addProjectMemberSchema.shape,
    async (params) => {
      const validated = addProjectMemberSchema.parse(params);
      const result = addProjectMember(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "remove_project_member",
    "Remove a user from a project (admin only)",
    removeProjectMemberSchema.shape,
    async (params) => {
      const validated = removeProjectMemberSchema.parse(params);
      const result = removeProjectMember(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "list_project_members",
    "List all members of a project with their roles",
    listProjectMembersSchema.shape,
    async (params) => {
      const validated = listProjectMembersSchema.parse(params);
      const result = listProjectMembers(userContext, validated);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "list_platforms",
    "List all available platform names for creating projects",
    listPlatformsSchema.shape,
    async () => {
      const result = listPlatforms(userContext);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  return server;
}

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// MCP POST endpoint - handles new sessions and requests
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    const existingTransport = transports[sessionId];
    if (!(existingTransport instanceof StreamableHTTPServerTransport)) {
      sendMcpJsonError(
        res,
        400,
        -32000,
        "Session exists but uses a different transport protocol"
      );
      return;
    }

    const userContext = getAuthorizedUserContext(req, res);
    if (!userContext) {
      return;
    }

    if (!requestMatchesSessionUser(sessionId, userContext)) {
      rejectUnauthorized(req, res, "Bearer token does not match session");
      return;
    }

    // Reuse existing session
    transport = existingTransport;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New session initialization - validate OAuth access token or API key
    const userContext = getAuthorizedUserContext(req, res);
    if (!userContext) {
      return;
    }

    // Create new transport
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
        sessionContexts[id] = userContext;
        console.log(`Session initialized: ${id} for user: ${userContext.user.name}`);
      },
      onsessionclosed: (id) => {
        deleteSession(id);
        console.log(`Session closed: ${id}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        deleteSession(transport.sessionId);
      }
    };

    // Create server with user context
    const server = createServer(userContext);
    await server.connect(transport);
  } else {
    const userContext = getAuthorizedUserContext(req, res);
    if (!userContext) {
      return;
    }

    sendMcpJsonError(res, 400, -32000, "Invalid session");
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// MCP GET endpoint - SSE stream for server notifications
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    const userContext = getAuthorizedUserContext(req, res);
    if (!userContext) {
      return;
    }

    sendMcpJsonError(res, 400, -32000, "Invalid session");
    return;
  }

  const userContext = getAuthorizedUserContext(req, res);
  if (!userContext) {
    return;
  }

  const transport = transports[sessionId];
  if (!(transport instanceof StreamableHTTPServerTransport)) {
    sendMcpJsonError(res, 400, -32000, "Invalid session");
    return;
  }

  if (!requestMatchesSessionUser(sessionId, userContext)) {
    rejectUnauthorized(req, res, "Bearer token does not match session");
    return;
  }

  await transport.handleRequest(req, res);
});

// MCP DELETE endpoint - session termination
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    const userContext = getAuthorizedUserContext(req, res);
    if (!userContext) {
      return;
    }

    sendMcpJsonError(res, 400, -32000, "Invalid session");
    return;
  }

  const userContext = getAuthorizedUserContext(req, res);
  if (!userContext) {
    return;
  }

  const transport = transports[sessionId];
  if (!(transport instanceof StreamableHTTPServerTransport)) {
    sendMcpJsonError(res, 400, -32000, "Invalid session");
    return;
  }

  if (!requestMatchesSessionUser(sessionId, userContext)) {
    rejectUnauthorized(req, res, "Bearer token does not match session");
    return;
  }

  await transport.handleRequest(req, res);
});

// Legacy HTTP+SSE endpoint for clients that have not moved to Streamable HTTP.
app.get("/sse", async (req, res) => {
  const userContext = getAuthorizedUserContext(req, res);
  if (!userContext) {
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  sessionContexts[transport.sessionId] = userContext;

  res.on("close", () => {
    deleteSession(transport.sessionId);
  });

  const server = createServer(userContext);
  await server.connect(transport);
});

// Legacy HTTP+SSE message endpoint.
app.post("/messages", async (req, res) => {
  const sessionId = getQuerySessionId(req.query.sessionId);
  if (!sessionId) {
    sendMcpJsonError(res, 400, -32000, "Missing sessionId");
    return;
  }

  const transport = transports[sessionId];
  if (!(transport instanceof SSEServerTransport)) {
    sendMcpJsonError(res, 400, -32000, "Invalid session");
    return;
  }

  const userContext = getAuthorizedUserContext(req, res);
  if (!userContext) {
    return;
  }

  if (!requestMatchesSessionUser(sessionId, userContext)) {
    rejectUnauthorized(req, res, "Bearer token does not match session");
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Telebugs MCP server listening on http://localhost:${PORT}/mcp`);
});
