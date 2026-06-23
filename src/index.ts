import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
import type { ZodRawShape } from "zod";
import {
  listProjectsOutputSchema,
  listErrorGroupsOutputSchema,
  getErrorGroupOutputSchema,
  listReportsOutputSchema,
  getReportOutputSchema,
  getStatisticsOutputSchema,
  searchErrorsOutputSchema,
  listReleasesOutputSchema,
  listReleaseArtifactsOutputSchema,
  getSourcemapStatusOutputSchema,
  resolveErrorGroupOutputSchema,
  unresolveErrorGroupOutputSchema,
  muteErrorGroupOutputSchema,
  unmuteErrorGroupOutputSchema,
  addNoteOutputSchema,
  deleteNoteOutputSchema,
  createProjectOutputSchema,
  updateProjectOutputSchema,
  deleteProjectOutputSchema,
  getProjectTokenOutputSchema,
  regenerateProjectTokenOutputSchema,
  addProjectMemberOutputSchema,
  removeProjectMemberOutputSchema,
  listProjectMembersOutputSchema,
  listPlatformsOutputSchema,
} from "./tools/output-schemas";

const PORT = parseInt(process.env.PORT ?? "3100", 10);

const app = express();
app.set("trust proxy", true);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
registerOAuthRoutes(app);

// Store transports and user contexts by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};
const sessionContexts: Record<string, UserContext> = {};

// Wraps a tool handler's plain return value into a structured MCP result. A
// handler returning `{ error: "..." }` becomes an `isError` result (which skips
// output-schema validation); anything else is returned as `structuredContent`
// plus a JSON text block for backward compatibility.
function toToolResult(result: unknown): {
  content: { type: "text"; text: string }[];
  structuredContent?: { [key: string]: unknown };
  isError?: boolean;
} {
  if (
    result !== null &&
    typeof result === "object" &&
    "error" in result &&
    typeof (result as { error: unknown }).error === "string"
  ) {
    return {
      content: [{ type: "text", text: (result as { error: string }).error }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result as { [key: string]: unknown },
  };
}

function createServer(userContext: UserContext): McpServer {
  const server = new McpServer({
    name: "telebugs-mcp",
    version: "0.4.0",
  });

  // Registers a tool with both an input and output schema. Each closure
  // captures userContext; the result is wrapped by toToolResult.
  const addTool = (
    name: string,
    description: string,
    inputSchema: ZodRawShape,
    outputSchema: ZodRawShape,
    run: (args: any) => unknown | Promise<unknown>
  ): void => {
    server.registerTool(
      name,
      { description, inputSchema, outputSchema },
      async (args: any) => toToolResult(await run(args))
    );
  };

  addTool(
    "list_projects",
    "List all projects accessible to the authenticated user",
    listProjectsSchema.shape,
    listProjectsOutputSchema.shape,
    () => listProjects(userContext)
  );

  addTool(
    "list_error_groups",
    "List deduplicated error groups with optional filtering by project, status, and date range",
    listErrorGroupsSchema.shape,
    listErrorGroupsOutputSchema.shape,
    (args) => listErrorGroups(userContext, args)
  );

  addTool(
    "get_error_group",
    "Get detailed information about a specific error group including notes",
    getErrorGroupSchema.shape,
    getErrorGroupOutputSchema.shape,
    (args) => getErrorGroup(userContext, args)
  );

  addTool(
    "list_reports",
    "List individual error occurrences with optional filtering",
    listReportsSchema.shape,
    listReportsOutputSchema.shape,
    (args) => listReports(userContext, args)
  );

  addTool(
    "get_report",
    "Get full details of a specific error report including stack trace, breadcrumbs, and context",
    getReportSchema.shape,
    getReportOutputSchema.shape,
    (args) => getReport(userContext, args)
  );

  addTool(
    "get_statistics",
    "Get aggregated error statistics over time with optional project filtering",
    getStatisticsSchema.shape,
    getStatisticsOutputSchema.shape,
    (args) => getStatistics(userContext, args)
  );

  addTool(
    "search_errors",
    "Full-text search across error types and messages",
    searchErrorsSchema.shape,
    searchErrorsOutputSchema.shape,
    (args) => searchErrors(userContext, args)
  );

  addTool(
    "list_releases",
    "List all releases for a project with artifact counts",
    listReleasesSchema.shape,
    listReleasesOutputSchema.shape,
    (args) => listReleases(userContext, args)
  );

  addTool(
    "list_release_artifacts",
    "List uploaded artifacts for a release",
    listReleaseArtifactsSchema.shape,
    listReleaseArtifactsOutputSchema.shape,
    (args) => listReleaseArtifacts(userContext, args)
  );

  addTool(
    "get_sourcemap_status",
    "Check if a debug ID has sourcemaps available",
    getSourcemapStatusSchema.shape,
    getSourcemapStatusOutputSchema.shape,
    (args) => getSourcemapStatus(userContext, args)
  );

  addTool(
    "resolve_error_group",
    "Resolve an error group (mark as fixed)",
    resolveErrorGroupSchema.shape,
    resolveErrorGroupOutputSchema.shape,
    (args) => resolveErrorGroup(userContext, args)
  );

  addTool(
    "unresolve_error_group",
    "Reopen a resolved error group",
    unresolveErrorGroupSchema.shape,
    unresolveErrorGroupOutputSchema.shape,
    (args) => unresolveErrorGroup(userContext, args)
  );

  addTool(
    "mute_error_group",
    "Mute an error group with optional expiry date",
    muteErrorGroupSchema.shape,
    muteErrorGroupOutputSchema.shape,
    (args) => muteErrorGroup(userContext, args)
  );

  addTool(
    "unmute_error_group",
    "Unmute a muted error group",
    unmuteErrorGroupSchema.shape,
    unmuteErrorGroupOutputSchema.shape,
    (args) => unmuteErrorGroup(userContext, args)
  );

  addTool(
    "add_note",
    "Add a note to an error group",
    addNoteSchema.shape,
    addNoteOutputSchema.shape,
    (args) => addNote(userContext, args)
  );

  addTool(
    "delete_note",
    "Delete a note from an error group (author only)",
    deleteNoteSchema.shape,
    deleteNoteOutputSchema.shape,
    (args) => deleteNote(userContext, args)
  );

  addTool(
    "create_project",
    "Create a new project (admin only). Use list_platforms to see available platform names.",
    createProjectSchema.shape,
    createProjectOutputSchema.shape,
    (args) => createProject(userContext, args)
  );

  addTool(
    "update_project",
    "Update a project's name or timezone (admin only)",
    updateProjectSchema.shape,
    updateProjectOutputSchema.shape,
    (args) => updateProject(userContext, args)
  );

  addTool(
    "delete_project",
    "Soft-delete a project (admin only). This is irreversible.",
    deleteProjectSchema.shape,
    deleteProjectOutputSchema.shape,
    (args) => deleteProject(userContext, args)
  );

  addTool(
    "get_project_token",
    "Get the token/DSN for a project to configure error reporting in your app",
    getProjectTokenSchema.shape,
    getProjectTokenOutputSchema.shape,
    (args) => getProjectToken(userContext, args)
  );

  addTool(
    "regenerate_project_token",
    "Regenerate a project's token (admin only). The old token becomes invalid immediately.",
    regenerateProjectTokenSchema.shape,
    regenerateProjectTokenOutputSchema.shape,
    (args) => regenerateProjectToken(userContext, args)
  );

  addTool(
    "add_project_member",
    "Add a user to a project (admin only)",
    addProjectMemberSchema.shape,
    addProjectMemberOutputSchema.shape,
    (args) => addProjectMember(userContext, args)
  );

  addTool(
    "remove_project_member",
    "Remove a user from a project (admin only)",
    removeProjectMemberSchema.shape,
    removeProjectMemberOutputSchema.shape,
    (args) => removeProjectMember(userContext, args)
  );

  addTool(
    "list_project_members",
    "List all members of a project with their roles",
    listProjectMembersSchema.shape,
    listProjectMembersOutputSchema.shape,
    (args) => listProjectMembers(userContext, args)
  );

  addTool(
    "list_platforms",
    "List all available platform names for creating projects",
    listPlatformsSchema.shape,
    listPlatformsOutputSchema.shape,
    () => listPlatforms(userContext)
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
    // Reuse existing session
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New session initialization - validate OAuth access token or API key
    const bearerToken = extractBearerToken(req.headers.authorization);
    if (!bearerToken) {
      setOAuthChallenge(req, res);
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Authorization required" },
        id: null,
      });
      return;
    }

    const userContext = validateBearerToken(bearerToken, getMcpResource(req));
    if (!userContext) {
      setOAuthChallenge(req, res);
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Invalid or expired bearer token" },
        id: null,
      });
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
        delete transports[id];
        delete sessionContexts[id];
        console.log(`Session closed: ${id}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        delete sessionContexts[transport.sessionId];
      }
    };

    // Create server with user context
    const server = createServer(userContext);
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid session" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// MCP GET endpoint - SSE stream for server notifications
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
});

// MCP DELETE endpoint - session termination
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
});

app.listen(PORT, () => {
  console.log(`Telebugs MCP server listening on http://localhost:${PORT}/mcp`);
});
