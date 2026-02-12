# Telebugs MCP Server

An MCP (Model Context Protocol) server that allows AI agents to retrieve error reports from Telebugs, a self-hosted Sentry alternative.

## Architecture

```
┌─────────────────┐                           ┌─────────────────────────────────────┐
│  Local Machine  │                           │              Remote VPS             │
│                 │         HTTPS             │                                     │
│  Claude Desktop │ ◄───────────────────────► │  Bun MCP Server   ───►  Telebugs    │
│                 │      (SSE transport)      │     :3100              SQLite DB    │
└─────────────────┘                           └─────────────────────────────────────┘
```

## Features

- **Direct database access** - Reads from Telebugs SQLite database (read-only)
- **API key authentication** - Uses existing Telebugs user API keys
- **Access control** - Users only see projects they're members of
- **SSE transport** - Allows remote Claude Desktop connections
- **Token efficient** - Compact JSON, defaults to open errors only
- **Single binary** - Cross-compile to Linux, no runtime dependencies

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all accessible projects |
| `list_error_groups` | List deduplicated error groups with filtering |
| `get_error_group` | Get details of a specific error group |
| `list_reports` | List individual error occurrences |
| `get_report` | Get full report with backtrace, breadcrumbs, context |
| `get_statistics` | Get aggregated error statistics |
| `search_errors` | Full-text search across errors |
| `list_releases` | List all releases for a project with artifact counts |
| `list_release_artifacts` | List uploaded artifacts for a release |
| `get_sourcemap_status` | Check if a debug ID has sourcemaps available |

### list_error_groups

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | number | - | Filter by project ID |
| `status` | string | `"open"` | `"open"`, `"resolved"`, `"muted"`, or `"all"` |
| `error_type` | string | - | Filter by exact error type |
| `error_message` | string | - | Filter by error message (substring match) |
| `from` | string | - | Start date (ISO 8601) |
| `to` | string | - | End date (ISO 8601) |
| `limit` | number | 20 | Max results (1-100) |
| `offset` | number | 0 | Skip N results for pagination |

Returns `total_count` for pagination.

### list_reports

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `group_id` | number | - | Filter by error group ID |
| `project_id` | number | - | Filter by project ID |
| `from` | string | - | Start date (ISO 8601) |
| `to` | string | - | End date (ISO 8601) |
| `limit` | number | 20 | Max results (1-100) |
| `offset` | number | 0 | Skip N results for pagination |

Returns `total_count` for pagination.

### search_errors

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Full-text search query |
| `project_id` | number | - | Filter by project ID |
| `limit` | number | 20 | Max results (1-100) |

## Installation

```bash
cd telebugs-mcp
bun install
```

## Build

```bash
# Build for current platform
bun run build

# Build for Linux (for VPS deployment)
bun run build:linux
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEBUGS_DB_PATH` | Path to Telebugs SQLite database | `/var/lib/docker/volumes/telebugs-data/_data/db/production.sqlite3` |
| `PORT` | HTTP port to listen on | `3100` |

## Running Locally

```bash
TELEBUGS_DB_PATH=/path/to/telebugs/storage/db/development.sqlite3 bun run dev
```

## Deployment

### Single Binary

```bash
# Copy to server
scp telebugs-mcp-linux root@your-server:~/telebugs-mcp-linux

# On server
chmod +x ~/telebugs-mcp-linux
./telebugs-mcp-linux
```

### systemd Service

Copy `telebugs-mcp.service` to `/etc/systemd/system/`:

```bash
cp telebugs-mcp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable telebugs-mcp
systemctl start telebugs-mcp
```

Check status:

```bash
systemctl status telebugs-mcp
```

### Nginx Reverse Proxy (Optional)

```nginx
location /mcp {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE support
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
}
```

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "telebugs": {
      "url": "http://your-server:3100/mcp",
      "headers": {
        "Authorization": "Bearer your_telebugs_api_key"
      }
    }
  }
}
```

### Getting Your API Key

1. Log into your Telebugs instance
2. Go to User → Account Settings → Security
3. Copy your API key

## Security

- Database opened in read-only mode
- API keys validated against active users only
- All queries filtered by user's project memberships
- Parameterized queries (no SQL injection)

## Health Check

```bash
curl http://localhost:3100/health
# {"status":"ok"}
```

## License

MIT
