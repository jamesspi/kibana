/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import type { ElasticsearchClient } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { API_BASE, SESSIONS_INDEX } from '../../common';

/**
 * The Jina OMNI multimodal embedding inference endpoint. Note the leading dot:
 * the preconfigured Elastic-managed endpoint in the cluster is registered as
 * `.jina-embeddings-v5-omni-small` with task_type `embedding` (1024 dims,
 * cosine). If this endpoint does not exist in the cluster, embedding calls will
 * fail and are caught gracefully so recording/synthesis are never broken.
 */
export const JINA_INFERENCE_ID = '.jina-embeddings-v5-omni-small';
export const EMBEDDINGS_INDEX = `${SESSIONS_INDEX}-embeddings`;
export const EMBEDDING_DIMS = 1024;

/**
 * Embed text via the Jina inference endpoint. Returns the dense vector, or
 * `null` if the endpoint is unavailable / errors. Never throws.
 */
export async function embedText(
  esClient: ElasticsearchClient,
  logger: Logger,
  input: string
): Promise<number[] | null> {
  if (!input || !input.trim()) return null;
  try {
    const result: any = await esClient.inference.inference({
      inference_id: JINA_INFERENCE_ID,
      // The OMNI endpoint is registered with task_type `embedding` (multimodal).
      // We omit a hard-coded task_type mismatch by letting ES use the endpoint's
      // configured task; passing `text_embedding` would 400 against this endpoint.
      input,
    } as any);

    // Response shape differs by task_type:
    //   text_embedding -> { text_embedding: [{ embedding: number[] }] }
    //   embedding      -> { embeddings:     [{ embedding: number[] }] }
    const vec =
      result?.text_embedding?.[0]?.embedding ??
      result?.embeddings?.[0]?.embedding ??
      result?.embedding ??
      null;

    if (!Array.isArray(vec)) {
      logger.warn(`Jina embedding returned unexpected shape for endpoint "${JINA_INFERENCE_ID}"`);
      return null;
    }
    return vec as number[];
  } catch (error: any) {
    logger.warn(
      `Embedding via "${JINA_INFERENCE_ID}" failed (endpoint may not exist): ${error.message}`
    );
    return null;
  }
}

/**
 * Ensure the embeddings index exists with a dense_vector mapping.
 */
async function ensureEmbeddingsIndex(esClient: ElasticsearchClient): Promise<void> {
  const exists = await esClient.indices.exists({ index: EMBEDDINGS_INDEX });
  if (exists) return;
  await esClient.indices.create({
    index: EMBEDDINGS_INDEX,
    mappings: {
      properties: {
        session_id: { type: 'keyword' },
        workflow_type: { type: 'keyword' },
        workflow_label: { type: 'text' },
        summary: { type: 'text' },
        embedded_at: { type: 'date' },
        vector: {
          type: 'dense_vector',
          dims: EMBEDDING_DIMS,
          index: true,
          similarity: 'cosine',
        },
      },
    },
  });
}

/**
 * Build a compact text summary of a session from its recorded events.
 */
function buildSessionSummary(events: any[]): string {
  const actionEvents = events.filter((e) => e.event_type !== 'narration');
  const narrations = events.filter((e) => e.event_type === 'narration');
  const lines: string[] = [];
  for (const e of actionEvents) {
    let line = `[${e.event_type}] ${e.description}`;
    if (e.narration) line += ` (reasoning: ${e.narration})`;
    lines.push(line);
  }
  for (const n of narrations) {
    lines.push(`Analyst note: ${n.description}`);
  }
  return lines.join('\n').slice(0, 8000);
}

export function registerEmbeddingsRoutes(router: IRouter, logger: Logger) {
  // Automatically embed a session: fetch events, summarize, embed, store.
  // Called by the client after stopRecording(). Designed to NEVER break the
  // recording flow — on any failure it returns ok with embedded:false.
  router.post(
    {
      path: `${API_BASE}/embed/auto`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          session_id: schema.string(),
        }),
      },
    },
    async (context, request, response) => {
      const { session_id } = request.body;
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        // Fetch session metadata (best-effort).
        let workflowType = '';
        let workflowLabel = '';
        try {
          const sessionDoc = await esClient.get({ index: SESSIONS_INDEX, id: session_id });
          const s = sessionDoc._source as any;
          workflowType = s?.workflow_type ?? '';
          workflowLabel = s?.workflow_label ?? '';
        } catch {
          // Non-critical.
        }

        const eventsResult = await esClient.search({
          index: `${SESSIONS_INDEX}-events`,
          size: 2000,
          sort: [{ '@timestamp': { order: 'asc' } }],
          query: { term: { session_id } },
        });
        const events = eventsResult.hits.hits.map((h) => h._source as any);

        if (events.length === 0) {
          return response.ok({ body: { embedded: false, reason: 'no_events' } });
        }

        const summary = buildSessionSummary(events);
        const vector = await embedText(esClient, logger, summary);

        if (!vector) {
          // Graceful: endpoint missing or failed. Do not break recording.
          return response.ok({
            body: { embedded: false, reason: 'embedding_unavailable' },
          });
        }

        await ensureEmbeddingsIndex(esClient);
        await esClient.index({
          index: EMBEDDINGS_INDEX,
          id: session_id, // one embedding doc per session (idempotent)
          document: {
            session_id,
            workflow_type: workflowType,
            workflow_label: workflowLabel,
            summary,
            vector,
            embedded_at: new Date().toISOString(),
          },
          refresh: 'wait_for',
        });

        logger.info(`Embedded session ${session_id} (${vector.length} dims)`);
        return response.ok({ body: { embedded: true, dims: vector.length } });
      } catch (error: any) {
        // Even on unexpected errors, fail gracefully so recording is unaffected.
        logger.warn(`Auto-embed failed for session ${session_id}: ${error.message}`);
        return response.ok({ body: { embedded: false, reason: 'error', message: error.message } });
      }
    }
  );

  // Semantic search across embedded sessions via kNN.
  router.post(
    {
      path: `${API_BASE}/search/sessions`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          query: schema.string(),
          size: schema.maybe(schema.number({ defaultValue: 10 })),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { query, size } = request.body;

        const vector = await embedText(esClient, logger, query);
        if (!vector) {
          return response.ok({
            body: { results: [], embedding_available: false },
          });
        }

        const indexExists = await esClient.indices.exists({ index: EMBEDDINGS_INDEX });
        if (!indexExists) {
          return response.ok({ body: { results: [], embedding_available: true } });
        }

        const k = size ?? 10;
        const result = await esClient.search({
          index: EMBEDDINGS_INDEX,
          knn: {
            field: 'vector',
            query_vector: vector,
            k,
            num_candidates: Math.max(k * 10, 50),
          },
          _source: ['session_id', 'workflow_type', 'workflow_label', 'summary', 'embedded_at'],
        });

        const results = result.hits.hits.map((h) => ({
          session_id: (h._source as any)?.session_id,
          workflow_type: (h._source as any)?.workflow_type,
          workflow_label: (h._source as any)?.workflow_label,
          summary: (h._source as any)?.summary,
          score: h._score,
        }));

        return response.ok({ body: { results, embedding_available: true } });
      } catch (error: any) {
        logger.error(`Session search failed: ${error.message}`);
        return response.customError({ statusCode: 500, body: { message: error.message } });
      }
    }
  );

  // "Similar SOPs" check: embed the combined summary of the given sessions and
  // find existing SOPs whose embeddings are similar, so the UI can suggest
  // reusing an existing SOP before synthesizing a new one.
  router.post(
    {
      path: `${API_BASE}/similar`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          session_ids: schema.arrayOf(schema.string(), { minSize: 1 }),
          size: schema.maybe(schema.number({ defaultValue: 5 })),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { session_ids, size } = request.body;

        const eventsResult = await esClient.search({
          index: `${SESSIONS_INDEX}-events`,
          size: 2000,
          sort: [{ '@timestamp': { order: 'asc' } }],
          query: { terms: { session_id: session_ids } },
        });
        const events = eventsResult.hits.hits.map((h) => h._source as any);
        const summary = buildSessionSummary(events);

        const vector = await embedText(esClient, logger, summary);
        if (!vector) {
          return response.ok({ body: { similar: [], embedding_available: false } });
        }

        const sopsIndex = `${SESSIONS_INDEX}-sops`;
        const indexExists = await esClient.indices.exists({ index: sopsIndex });
        if (!indexExists) {
          return response.ok({ body: { similar: [], embedding_available: true } });
        }

        // SOPs are searched by kNN on their stored `vector` field. SOPs created
        // before this feature may lack a vector; those simply won't match. We
        // pull steps/tool_ids/source_sessions too so the UI can EXPLAIN the
        // match (shared tools, overlapping sessions) and PREVIEW/LINK the SOP.
        const k = size ?? 5;
        let result;
        try {
          result = await esClient.search({
            index: sopsIndex,
            knn: {
              field: 'vector',
              query_vector: vector,
              k,
              num_candidates: Math.max(k * 10, 50),
            },
            _source: [
              'name',
              'description',
              'confidence',
              'source_sessions',
              'created_at',
              'steps',
              'tool_ids',
            ],
          });
        } catch (knnError: any) {
          // The SOPs index may not have a dense_vector mapping yet.
          logger.warn(`Similar-SOP kNN unavailable: ${knnError.message}`);
          return response.ok({ body: { similar: [], embedding_available: true } });
        }

        // What tools/topics do the candidate sessions imply? Used to explain
        // overlap with each matched SOP in human terms.
        const querySessionSet = new Set(session_ids);

        const similar = result.hits.hits.map((h) => {
          const src = (h._source as any) ?? {};
          const steps = Array.isArray(src.steps) ? src.steps : [];
          const toolIds: string[] =
            Array.isArray(src.tool_ids) && src.tool_ids.length
              ? src.tool_ids
              : Array.from(
                  new Set(
                    steps
                      .map((s: any) => s?.tool_id)
                      .filter((t: any): t is string => typeof t === 'string' && t.length > 0)
                  )
                );
          const sourceSessions: string[] = Array.isArray(src.source_sessions)
            ? src.source_sessions
            : [];

          // Build human-readable "why this matched" reasons.
          const matchReasons: string[] = [];
          if (typeof h._score === 'number') {
            // ES cosine kNN scores sit in ~[1, 2]; keep the explanation
            // qualitative to avoid over-claiming numeric precision.
            const strength = h._score >= 1.6 ? 'high' : h._score >= 1.3 ? 'moderate' : 'some';
            matchReasons.push(
              `${strength} semantic similarity to the selected sessions (vector score ${h._score.toFixed(
                3
              )})`
            );
          }
          const overlappingSessions = sourceSessions.filter((s) => querySessionSet.has(s));
          if (overlappingSessions.length > 0) {
            matchReasons.push(
              `${overlappingSessions.length} of the selected session${
                overlappingSessions.length === 1 ? ' is' : 's are'
              } already a source for this SOP`
            );
          }
          if (toolIds.length > 0) {
            matchReasons.push(
              `uses agent tools: ${toolIds.slice(0, 4).join(', ')}${toolIds.length > 4 ? '…' : ''}`
            );
          }
          if (steps.length > 0) {
            matchReasons.push(`covers ${steps.length} agent step${steps.length === 1 ? '' : 's'}`);
          }

          return {
            id: h._id,
            name: src.name,
            description: src.description,
            confidence: src.confidence,
            score: h._score,
            tool_ids: toolIds,
            steps,
            source_sessions: sourceSessions,
            created_at: src.created_at,
            match_reasons: matchReasons,
          };
        });

        return response.ok({ body: { similar, embedding_available: true } });
      } catch (error: any) {
        logger.error(`Similar-SOP search failed: ${error.message}`);
        return response.customError({ statusCode: 500, body: { message: error.message } });
      }
    }
  );
}
