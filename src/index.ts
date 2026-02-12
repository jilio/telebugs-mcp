import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { validateApiKey, type UserContext } from "./auth";

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

const PORT = parseInt(process.env.PORT ?? "3100", 10);

const app = express();
app.use(express.json());

// Store transports and user contexts by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};
const sessionContexts: Record<string, UserContext> = {};

function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
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
    // New session initialization - validate API key
    const apiKey = extractApiKey(req.headers.authorization);
    if (!apiKey) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing Authorization header" },
        id: null,
      });
      return;
    }

    const userContext = validateApiKey(apiKey);
    if (!userContext) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Invalid API key" },
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
