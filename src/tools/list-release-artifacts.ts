import { z } from "zod";
import { query, queryOne } from "../db";
import type { UserContext } from "../auth";

export const listReleaseArtifactsSchema = z.object({
  release_id: z.number().describe("The release ID"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of results (1-100, default 20)"),
  offset: z
    .number()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
});

interface Release {
  id: number;
  project_id: number;
}

interface Artifact {
  id: number;
  name: string;
  debug_id: string | null;
  byte_size: number | null;
  content_type: string | null;
  created_at: string;
}

export function listReleaseArtifacts(
  ctx: UserContext,
  params: z.infer<typeof listReleaseArtifactsSchema>
): object {
  const release = queryOne<Release>(
    `SELECT id, project_id FROM releases WHERE id = ?`,
    [params.release_id]
  );

  if (!release) {
    return { error: "Release not found" };
  }

  if (!ctx.projectIds.includes(release.project_id)) {
    return { error: "Access denied to this release" };
  }

  const countResult = query<{ count: number }>(
    `SELECT COUNT(*) as count FROM artifacts a WHERE a.release_id = ?`,
    [params.release_id]
  );
  const totalCount = countResult[0]?.count ?? 0;

  const artifacts = query<Artifact>(
    `SELECT a.id, a.name, a.debug_id, blob.byte_size, blob.content_type, a.created_at
     FROM artifacts a
     LEFT JOIN active_storage_attachments att
       ON att.record_type = 'Artifact' AND att.record_id = a.id
     LEFT JOIN active_storage_blobs blob
       ON blob.id = att.blob_id
     WHERE a.release_id = ?
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [params.release_id, params.limit, params.offset]
  );

  return {
    total_count: totalCount,
    artifacts: artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      debug_id: a.debug_id,
      byte_size: a.byte_size,
      content_type: a.content_type,
      created_at: a.created_at,
    })),
  };
}
