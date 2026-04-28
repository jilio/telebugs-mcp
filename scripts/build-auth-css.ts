import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tailwind from "bun-plugin-tailwind";

const outputPath = "src/ui/oauth.generated.css";
const tempDir = await mkdtemp(join(tmpdir(), "telebugs-mcp-tailwind-"));

try {
  const result = await Bun.build({
    entrypoints: ["src/ui/oauth.css"],
    outdir: tempDir,
    plugins: [tailwind],
    minify: true,
    target: "browser",
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  const cssOutput = result.outputs.find((output) =>
    output.path.endsWith("/oauth.css")
  );
  if (!cssOutput) {
    console.error("Expected Bun Tailwind build to emit oauth.css.");
    process.exit(1);
  }

  await Bun.write(outputPath, cssOutput);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
