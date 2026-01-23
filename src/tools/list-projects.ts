import { z } from "zod";
import { query } from "../db";
import type { UserContext } from "../auth";

export const listProjectsSchema = z.object({});

interface Project {
  id: number;
  name: string;
  platform: number | null;
  timezone: string;
  groups_count: number;
  reports_count: number;
  created_at: string;
}

const PLATFORMS: Record<number, string> = {
  0: "Ruby", 1: "Ruby on Rails", 2: "PHP", 3: "Laravel", 4: "JavaScript",
  5: "Android", 6: "Apple", 7: "Dart", 8: "Flutter", 9: "Elixir",
  10: "Phoenix", 11: "Oban", 12: "Quantum", 13: "tvOS", 14: "macOS",
  15: "visionOS", 16: "watchOS", 17: "iOS", 18: "Unreal Engine", 19: "Unity",
  20: "Rust", 21: "DelayedJob", 22: "Rack Middleware", 23: "Resque", 24: "Sidekiq",
  25: "React Native", 26: "React", 27: "Python", 28: "Go", 29: "Echo",
  30: "FastHTTP", 31: "Fiber", 32: "Gin", 33: "Iris", 34: "Logrus",
  35: "Negroni", 36: "net/http", 37: "Slog", 38: "Zerolog", 39: "Godot Engine",
  40: "Java", 41: "java.util.logging", 42: "Log4j 2x", 43: "Logback", 44: "Servlet",
  45: "Spring", 46: "Spring Boot", 47: "Angular", 48: "Astro", 49: "AWS Lambda (JavaScript)",
  50: "Azure Functions (JavaScript)", 51: "Bun", 52: "Capacitor", 53: "Cloudflare", 54: "Connect",
  55: "Cordova", 56: "Deno", 57: "Electron", 58: "Ember", 59: "Express",
  60: "Fastify", 61: "Gatsby", 62: "Google Cloud Functions (JavaScript)", 63: "Hapi", 64: "Hono",
  65: "Koa", 66: "Nest.js", 67: "Next.js", 68: "Node.js", 69: "Nuxt",
  70: "React Router Framework", 71: "Remix", 72: "Solid", 73: "SolidStart", 74: "Svelte",
  75: "SvelteKit", 76: "TanStack Start React", 77: "Vue", 78: "Wasm", 79: "Kotlin",
  80: "Kotlin Multiplatform", 81: "Native", 82: "Google Breakpad", 83: "Google Crashpad", 84: "Minidumps",
  85: "Qt", 86: "WebAssembly", 87: ".NET", 88: "ASP.NET", 89: "ASP.NET Core",
  90: "AWS Lambda (.NET)", 91: "Azure Functions (.NET)", 92: "Google Cloud Functions (.NET)", 93: "Blazor WebAssembly", 94: "Entity Framework",
  95: "log4net", 96: "Microsoft.Extensions.Logging", 97: "NLog", 98: "Serilog", 99: "UWP",
  100: "Windows Forms", 101: "WPF", 102: "MAUI", 103: "Xamarin", 104: "Nintendo Switch",
  105: "Symfony", 106: "PowerShell", 107: "AIOHTTP", 108: "Anthropic", 109: "Apache Airflow",
  110: "Apache Beam", 111: "Apache Spark", 112: "Ariadne", 113: "arq", 114: "ASGI",
  115: "asyncio", 116: "asyncpg", 117: "AWS Lambda (Python)", 118: "Boto3", 119: "Bottle",
  120: "Celery", 121: "Chalice", 122: "clickhouse-driver", 123: "Cloud Resource Context", 124: "Cohere",
  125: "Django", 126: "Dramatiq", 127: "Falcon", 128: "FastAPI", 129: "Flask",
  130: "GNU Backtrace", 131: "Google Cloud Functions (Python)", 132: "GQL", 133: "Graphene", 134: "gRPC",
  135: "HTTPX", 136: "huey", 137: "Huggingface Hub", 138: "Langchain", 139: "LaunchDarkly",
  140: "Litestar", 141: "Logging", 142: "Loguru", 143: "OpenAI", 144: "OpenFeature",
  145: "pure_eval", 146: "PyMongo", 147: "Pyramid", 148: "Quart", 149: "Ray",
  150: "Redis", 151: "RQ (Redis Queue)", 152: "Rust Tracing", 153: "Sanic", 154: "Serverless",
  155: "Socket", 156: "SQLAlchemy", 157: "Starlette", 158: "Statsig", 159: "Strawberry",
  160: "sys.exit", 161: "Tornado", 162: "Tryton", 163: "Typer", 164: "Unleash",
  165: "WSGI", 166: "Default Integrations",
};

export function listProjects(ctx: UserContext): object {
  if (ctx.projectIds.length === 0) {
    return { projects: [] };
  }

  const placeholders = ctx.projectIds.map(() => "?").join(", ");
  const projects = query<Project>(
    `SELECT id, name, platform, timezone, groups_count, reports_count, created_at
     FROM projects
     WHERE id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY name`,
    ctx.projectIds
  );

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      platform: p.platform !== null ? (PLATFORMS[p.platform] ?? "unknown") : "unknown",
      timezone: p.timezone,
      error_groups_count: p.groups_count,
      reports_count: p.reports_count,
      created_at: p.created_at,
    })),
  };
}
