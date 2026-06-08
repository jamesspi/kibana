import { IRouter, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { API_BASE, SESSIONS_INDEX } from '../../common';

// Each upload request carries at most one ~4MB (base64) chunk so neither the
// HTTP request nor any single Elasticsearch document is ever oversized. A
// multi-MB screen recording is split across several chunk docs that share a
// `media_id` and are reassembled in order on read.
const MEDIA_INDEX = `${SESSIONS_INDEX}-media`;

const MEDIA_PROPERTIES = {
  session_id: { type: 'keyword' },
  media_id: { type: 'keyword' },
  media_type: { type: 'keyword' },
  size_bytes: { type: 'long' },
  chunk_index: { type: 'integer' },
  total_chunks: { type: 'integer' },
  data: { type: 'binary' },
  created_at: { type: 'date' },
  // For media_type:'frame' — offset (ms from recording start) of the captured
  // screen keyframe so synthesis can correlate a frame with event timestamps
  // and cite "screen frame @ MM:SS". Unused for video/audio.
  timestamp_ms: { type: 'long' },
  // For media_type:'frame' — the image MIME type (e.g. image/jpeg) so the
  // synthesis route can build a Claude image content part without guessing.
  mime_type: { type: 'keyword' },
} as const;

async function ensureMediaIndex(esClient: any) {
  const indexExists = await esClient.indices.exists({ index: MEDIA_INDEX });
  if (!indexExists) {
    await esClient.indices.create({ index: MEDIA_INDEX, mappings: { properties: MEDIA_PROPERTIES } });
    return;
  }
  // Index predates chunking: additively add the new fields so they are mapped
  // explicitly (idempotent — ES ignores fields that already exist).
  try {
    await esClient.indices.putMapping({ index: MEDIA_INDEX, properties: MEDIA_PROPERTIES as any });
  } catch {
    // Non-fatal: dynamic mapping will still index the new fields correctly.
  }
}

export function registerMediaRoutes(router: IRouter, logger: Logger) {
  router.post(
    {
      path: `${API_BASE}/media/upload`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      // Per-chunk cap. Chunks are ~4MB of base64 but we leave generous headroom
      // for the JSON envelope and any single legacy (unchunked) upload.
      options: { body: { maxBytes: 100 * 1024 * 1024 } },
      validate: {
        body: schema.object({
          session_id: schema.string(),
          media_type: schema.oneOf([
            schema.literal('video'),
            schema.literal('audio'),
            // A periodic screen keyframe (downscaled JPEG) extracted client-side
            // during recording and later sent to Claude as an image content part.
            schema.literal('frame'),
          ]),
          data_base64: schema.string(),
          // Optional chunking metadata. When omitted the payload is treated as a
          // single, self-contained chunk (backward compatible with old clients).
          media_id: schema.maybe(schema.string()),
          chunk_index: schema.maybe(schema.number()),
          total_chunks: schema.maybe(schema.number()),
          // Frame-only metadata (see MEDIA_PROPERTIES).
          timestamp_ms: schema.maybe(schema.number()),
          mime_type: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { session_id, media_type, data_base64 } = request.body;
        const mediaId = request.body.media_id ?? `${session_id}-${media_type}`;
        const chunkIndex = request.body.chunk_index ?? 0;
        const totalChunks = request.body.total_chunks ?? 1;
        const { timestamp_ms, mime_type } = request.body;

        await ensureMediaIndex(esClient);

        const chunkSizeBytes = Math.round(data_base64.length * 0.75);
        await esClient.index({
          index: MEDIA_INDEX,
          document: {
            session_id,
            media_id: mediaId,
            media_type,
            size_bytes: chunkSizeBytes,
            chunk_index: chunkIndex,
            total_chunks: totalChunks,
            data: data_base64,
            created_at: new Date().toISOString(),
            ...(timestamp_ms !== undefined ? { timestamp_ms } : {}),
            ...(mime_type !== undefined ? { mime_type } : {}),
          },
          refresh: 'wait_for',
        });

        logger.info(
          `Stored ${media_type} chunk ${chunkIndex + 1}/${totalChunks} for session ${session_id} ` +
            `(${Math.round(chunkSizeBytes / 1024)}KB, media_id=${mediaId})`
        );
        return response.ok({ body: { stored: true, size_bytes: chunkSizeBytes } });
      } catch (error: any) {
        logger.error(`Media upload failed: ${error.message}`);
        return response.customError({ statusCode: 500, body: { message: error.message } });
      }
    }
  );

  router.get(
    {
      path: `${API_BASE}/media/{sessionId}`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: { params: schema.object({ sessionId: schema.string() }) },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        // A single recording can span many chunk docs; pull them all and
        // reassemble per media_id below. 1000 chunks * ~4MB ~= 4GB ceiling,
        // far beyond any realistic recording.
        const result = await esClient.search({
          index: MEDIA_INDEX,
          size: 1000,
          query: { term: { session_id: request.params.sessionId } },
        });

        // Group every chunk by its media_id (falling back to type for legacy
        // single-doc media that predates chunking).
        const groups = new Map<
          string,
          {
            media_type: string;
            created_at?: string;
            total_chunks: number;
            chunks: Array<{ index: number; data: string; size_bytes: number }>;
          }
        >();

        for (const hit of result.hits.hits) {
          const s = hit._source as any;
          const key = s.media_id ?? `${s.media_type}`;
          if (!groups.has(key)) {
            groups.set(key, {
              media_type: s.media_type,
              created_at: s.created_at,
              total_chunks: s.total_chunks ?? 1,
              chunks: [],
            });
          }
          const g = groups.get(key)!;
          g.chunks.push({
            index: s.chunk_index ?? 0,
            data: s.data ?? '',
            size_bytes: s.size_bytes ?? 0,
          });
          if (s.created_at && (!g.created_at || s.created_at < g.created_at)) g.created_at = s.created_at;
        }

        const media = Array.from(groups.values())
          .map((g) => {
            const ordered = g.chunks.sort((a, b) => a.index - b.index);
            const data_base64 = ordered.map((c) => c.data).join('');
            const size_bytes = ordered.reduce((sum, c) => sum + c.size_bytes, 0);
            const complete = ordered.length >= g.total_chunks;
            if (!complete) {
              logger.warn(
                `Media ${g.media_type} for session ${request.params.sessionId} is incomplete: ` +
                  `${ordered.length}/${g.total_chunks} chunks present`
              );
            }
            return { media_type: g.media_type, size_bytes, data_base64, created_at: g.created_at, complete };
          })
          // Only return media we can actually play back.
          .filter((m) => m.complete && m.data_base64.length > 0);

        return response.ok({ body: { media } });
      } catch (error: any) {
        if (error?.meta?.statusCode === 404) return response.ok({ body: { media: [] } });
        return response.customError({ statusCode: 500, body: { message: error.message } });
      }
    }
  );

  // Fetch the screen keyframes for a session, ordered by their offset from the
  // start of the recording. Used by the synthesis route to build multimodal
  // (image) content parts for Claude. Frames are single-chunk JPEGs, so unlike
  // video/audio they don't need reassembly.
  router.get(
    {
      path: `${API_BASE}/media/{sessionId}/frames`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: { params: schema.object({ sessionId: schema.string() }) },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const result = await esClient.search({
          index: MEDIA_INDEX,
          size: 500,
          query: {
            bool: {
              filter: [
                { term: { session_id: request.params.sessionId } },
                { term: { media_type: 'frame' } },
              ],
            },
          },
          sort: [{ timestamp_ms: { order: 'asc' } }],
        });

        const frames = result.hits.hits.map((hit) => {
          const s = hit._source as any;
          return {
            timestamp_ms: s.timestamp_ms ?? 0,
            mime_type: s.mime_type ?? 'image/jpeg',
            data_base64: s.data ?? '',
            size_bytes: s.size_bytes ?? 0,
          };
        });

        return response.ok({ body: { frames } });
      } catch (error: any) {
        if (error?.meta?.statusCode === 404) return response.ok({ body: { frames: [] } });
        return response.customError({ statusCode: 500, body: { message: error.message } });
      }
    }
  );
}
