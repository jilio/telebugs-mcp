import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db, queryOne } from "../db";
import { Role, type UserContext } from "../auth";

const PLATFORMS: Record<string, number> = {
  "Ruby": 0, "Ruby on Rails": 1, "PHP": 2, "Laravel": 3, "JavaScript": 4,
  "Android": 5, "Apple": 6, "Dart": 7, "Flutter": 8, "Elixir": 9,
  "Phoenix": 10, "Oban": 11, "Quantum": 12, "tvOS": 13, "macOS": 14,
  "visionOS": 15, "watchOS": 16, "iOS": 17, "Unreal Engine": 18, "Unity": 19,
  "Rust": 20, "DelayedJob": 21, "Rack Middleware": 22, "Resque": 23, "Sidekiq": 24,
  "React Native": 25, "React": 26, "Python": 27, "Go": 28, "Echo": 29,
  "FastHTTP": 30, "Fiber": 31, "Gin": 32, "Iris": 33, "Logrus": 34,
  "Negroni": 35, "net/http": 36, "Slog": 37, "Zerolog": 38, "Godot Engine": 39,
  "Java": 40, "java.util.logging": 41, "Log4j 2x": 42, "Logback": 43, "Servlet": 44,
  "Spring": 45, "Spring Boot": 46, "Angular": 47, "Astro": 48, "AWS Lambda (JavaScript)": 49,
  "Azure Functions (JavaScript)": 50, "Bun": 51, "Capacitor": 52, "Cloudflare": 53, "Connect": 54,
  "Cordova": 55, "Deno": 56, "Electron": 57, "Ember": 58, "Express": 59,
  "Fastify": 60, "Gatsby": 61, "Google Cloud Functions (JavaScript)": 62, "Hapi": 63, "Hono": 64,
  "Koa": 65, "Nest.js": 66, "Next.js": 67, "Node.js": 68, "Nuxt": 69,
  "React Router Framework": 70, "Remix": 71, "Solid": 72, "SolidStart": 73, "Svelte": 74,
  "SvelteKit": 75, "TanStack Start React": 76, "Vue": 77, "Wasm": 78, "Kotlin": 79,
  "Kotlin Multiplatform": 80, "Native": 81, "Google Breakpad": 82, "Google Crashpad": 83, "Minidumps": 84,
  "Qt": 85, "WebAssembly": 86, ".NET": 87, "ASP.NET": 88, "ASP.NET Core": 89,
  "AWS Lambda (.NET)": 90, "Azure Functions (.NET)": 91, "Google Cloud Functions (.NET)": 92, "Blazor WebAssembly": 93, "Entity Framework": 94,
  "log4net": 95, "Microsoft.Extensions.Logging": 96, "NLog": 97, "Serilog": 98, "UWP": 99,
  "Windows Forms": 100, "WPF": 101, "MAUI": 102, "Xamarin": 103, "Nintendo Switch": 104,
  "Symfony": 105, "PowerShell": 106, "AIOHTTP": 107, "Anthropic": 108, "Apache Airflow": 109,
  "Apache Beam": 110, "Apache Spark": 111, "Ariadne": 112, "arq": 113, "ASGI": 114,
  "asyncio": 115, "asyncpg": 116, "AWS Lambda (Python)": 117, "Boto3": 118, "Bottle": 119,
  "Celery": 120, "Chalice": 121, "clickhouse-driver": 122, "Cloud Resource Context": 123, "Cohere": 124,
  "Django": 125, "Dramatiq": 126, "Falcon": 127, "FastAPI": 128, "Flask": 129,
  "GNU Backtrace": 130, "Google Cloud Functions (Python)": 131, "GQL": 132, "Graphene": 133, "gRPC": 134,
  "HTTPX": 135, "huey": 136, "Huggingface Hub": 137, "Langchain": 138, "LaunchDarkly": 139,
  "Litestar": 140, "Logging": 141, "Loguru": 142, "OpenAI": 143, "OpenFeature": 144,
  "pure_eval": 145, "PyMongo": 146, "Pyramid": 147, "Quart": 148, "Ray": 149,
  "Redis": 150, "RQ (Redis Queue)": 151, "Rust Tracing": 152, "Sanic": 153, "Serverless": 154,
  "Socket": 155, "SQLAlchemy": 156, "Starlette": 157, "Statsig": 158, "Strawberry": 159,
  "sys.exit": 160, "Tornado": 161, "Tryton": 162, "Typer": 163, "Unleash": 164,
  "WSGI": 165, "Default Integrations": 166,
};

export const PLATFORM_NAMES = Object.keys(PLATFORMS);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255).describe("Project name"),
  platform: z.string().describe("Platform name (e.g. 'Ruby on Rails', 'Node.js', 'Python')"),
  timezone: z.string().default("UTC").describe("Project timezone (e.g. 'UTC', 'America/New_York')"),
});

export function createProject(
  ctx: UserContext,
  params: z.infer<typeof createProjectSchema>
): object {
  if (ctx.user.role !== Role.ADMIN) {
    return { error: "Admin access required to create projects" };
  }

  const existing = queryOne<{ id: number }>(
    `SELECT id FROM projects WHERE name = ? AND deleted_at IS NULL`,
    [params.name]
  );
  if (existing) {
    return { error: `A project named '${params.name}' already exists` };
  }

  const platformId = PLATFORMS[params.platform];
  if (platformId === undefined) {
    return {
      error: `Unknown platform '${params.platform}'. Use list_platforms to see available options.`,
    };
  }

  const now = new Date().toISOString();
  const token = randomBytes(32).toString("hex");

  const insertProject = db.prepare(
    `INSERT INTO projects (name, platform, timezone, token, groups_count, reports_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`
  );
  const insertMembership = db.prepare(
    `INSERT INTO project_memberships (project_id, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?)`
  );

  const transaction = db.transaction(() => {
    const result = insertProject.run(params.name, platformId, params.timezone, token, now, now);
    const projectId = Number(result.lastInsertRowid);
    insertMembership.run(projectId, ctx.user.id, now, now);
    return { projectId, token };
  });

  const { projectId, token: projectToken } = transaction();

  return {
    success: true,
    project: {
      id: projectId,
      name: params.name,
      platform: params.platform,
      timezone: params.timezone,
      token: projectToken,
    },
  };
}
