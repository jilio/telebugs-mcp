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

- **Direct database access** - Reads and writes to Telebugs SQLite database
- **MCP OAuth authentication** - Browser-based OAuth flow backed by Telebugs users
- **API key authentication** - Still accepts existing Telebugs user API keys as bearer tokens
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
| `resolve_error_group` | Resolve an error group (mark as fixed) |
| `unresolve_error_group` | Reopen a resolved error group |
| `mute_error_group` | Mute an error group with optional expiry |
| `unmute_error_group` | Unmute a muted error group |
| `add_note` | Add a note to an error group |
| `delete_note` | Delete a note from an error group (author only) |
| `create_project` | Create a new project (admin only) |
| `update_project` | Update a project's name or timezone (admin only) |
| `delete_project` | Soft-delete a project (admin only) |
| `get_project_token` | Get a project's token/DSN for SDK config |
| `regenerate_project_token` | Regenerate a project's token (admin only) |
| `add_project_member` | Add a user to a project (admin only) |
| `remove_project_member` | Remove a user from a project (admin only) |
| `list_project_members` | List project members with roles |
| `list_platforms` | List available platform names for project creation |

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

### resolve_error_group / unresolve_error_group / unmute_error_group

These tools only require `group_id` (number).

### mute_error_group

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `group_id` | number | required | The error group ID |
| `muted_until` | string | - | Optional ISO 8601 date until which the group is muted |

### add_note

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `group_id` | number | required | The error group ID |
| `content` | string | required | The note content |

### delete_note

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `group_id` | number | required | The error group ID |
| `note_id` | number | required | The note ID to delete |

### create_project (admin only)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | required | Project name (unique) |
| `platform` | string | required | Platform name — use `list_platforms` to see options |
| `timezone` | string | `"UTC"` | Project timezone (e.g. `"America/New_York"`) |

### update_project (admin only)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | number | required | The project ID to update |
| `name` | string | - | New project name |
| `timezone` | string | - | New timezone |

### delete_project / regenerate_project_token (admin only)

These tools only require `project_id` (number).

### add_project_member / remove_project_member (admin only)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | number | required | The project ID |
| `user_id` | number | required | The user ID to add/remove |

### get_project_token / list_project_members

These tools only require `project_id` (number).

### list_platforms

No parameters. Returns all available platform names.

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
| `MCP_BASE_URL` | Public base URL for OAuth metadata and redirects | inferred from request |
| `OAUTH_ACCESS_TOKEN_TTL_SECONDS` | Lifetime for MCP OAuth access tokens | `43200` |
| `TELEBUGS_SECRET_KEY_BASE` | Telebugs Rails `secret_key_base`, required to accept Telebugs sign-in links | unset |

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

For OAuth-capable MCP clients, configure the server URL only. The client will discover OAuth metadata, open a browser sign-in page, and retry with the issued bearer token:

```json
{
  "mcpServers": {
    "telebugs": {
      "url": "https://your-server/mcp"
    }
  }
}
```

When the MCP server runs behind a reverse proxy, set `MCP_BASE_URL` to the public HTTPS origin:

```bash
MCP_BASE_URL=https://your-server bun run start
```

The OAuth sign-in page is rendered by React with CSS generated from Tailwind by Bun's Tailwind plugin. It matches the Telebugs sign-in page, shows the requesting client and redirect origin, and requires explicit approval before issuing an authorization code. It accepts your Telebugs email/password, verified against the same bcrypt `users.password_digest` used by Telebugs. It can also accept a Telebugs sign-in link from `/session/transfers/...` when `TELEBUGS_SECRET_KEY_BASE` is set so the MCP server can derive Rails' `active_record/signed_id` verifier key and validate the signed id payload.

If Telebugs is configured with `RAILS_MASTER_KEY` instead of `SECRET_KEY_BASE`, read the value from the Telebugs app with `bin/rails runner 'puts Rails.application.secret_key_base'` and pass it to this server as `TELEBUGS_SECRET_KEY_BASE`.

For clients that do not support MCP OAuth yet, a static bearer token still works. Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

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

- Admin-only operations enforced for project management (create, update, delete, token regen, membership)
- Write operations limited to error status changes, notes, and project management
- All mutations scoped to user's project memberships
- API keys validated against active users only
- OAuth access tokens are short-lived and kept in memory by the MCP server
- All queries filtered by user's project memberships
- Parameterized queries (no SQL injection)

## Health Check

```bash
curl http://localhost:3100/health
# {"status":"ok"}
```

## License

MIT
