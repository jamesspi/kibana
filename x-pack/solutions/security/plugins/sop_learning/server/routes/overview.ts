/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, IRouter, Logger } from '@kbn/core/server';
import { API_BASE, SESSIONS_INDEX } from '../../common';
import type { OverviewMetrics } from '../../common';

const EVENTS_INDEX = `${SESSIONS_INDEX}-events`;
const SOPS_INDEX = `${SESSIONS_INDEX}-sops`;
const MEDIA_INDEX = `${SESSIONS_INDEX}-media`;
const EMBEDDINGS_INDEX = `${SESSIONS_INDEX}-embeddings`;
const DEPLOYMENTS_INDEX = 'sop-learning-deployments';

/** Turn an ES `terms` agg into a plain { key: count } map. */
function termsToMap(agg: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of agg?.buckets ?? []) out[String(b.key)] = b.doc_count;
  return out;
}

const EMPTY_RESULT = { hits: { total: { value: 0 } }, aggregations: {} };

/**
 * Run a search, returning a safe empty result instead of throwing. This guards the
 * Overview route from a single missing index (404) or a single bad sub-aggregation
 * (e.g. `search_phase_execution_exception` / fielddata errors) taking down the whole
 * response. Whatever metrics are available still render.
 */
async function safeSearch(es: ElasticsearchClient, logger: Logger, body: any): Promise<any> {
  try {
    return await es.search(body);
  } catch (error: any) {
    const statusCode = error?.meta?.statusCode;
    const esType =
      error?.meta?.body?.error?.type ??
      error?.body?.error?.type ??
      error?.meta?.body?.error?.root_cause?.[0]?.type;
    if (statusCode === 404) return EMPTY_RESULT;
    logger.warn(
      `Overview aggregation on index "${body?.index}" failed (${esType ?? statusCode ?? 'unknown'}): ${
        error?.message ?? error
      }. Returning empty metrics for this index.`
    );
    return EMPTY_RESULT;
  }
}

export function registerOverviewRoutes(router: IRouter, logger: Logger) {
  router.get(
    {
      path: `${API_BASE}/overview`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: false,
    },
    async (context, request, response) => {
      try {
        const es = (await context.core).elasticsearch.client.asCurrentUser;

        const [sessionsRes, eventsRes, sopsRes, mediaRes, deploymentsRes, embeddingsRes] =
          await Promise.all([
            safeSearch(es, logger, {
              index: SESSIONS_INDEX,
              size: 0,
              track_total_hits: true,
              aggs: {
                by_status: { terms: { field: 'status', size: 10 } },
                by_type: { terms: { field: 'workflow_type', size: 20 } },
                by_analyst: { terms: { field: 'analyst_name', size: 20 } },
                activity: {
                  date_histogram: {
                    field: 'started_at',
                    calendar_interval: 'day',
                    min_doc_count: 1,
                  },
                },
              },
            }),
            safeSearch(es, logger, {
              index: EVENTS_INDEX,
              size: 0,
              track_total_hits: true,
              aggs: {
                by_category: { terms: { field: 'category', size: 20 } },
                // `query.esql` is the event_type emitted by the recording widget when it
                // intercepts an ES|QL search (see RecordingWidget/RecordingOverlay).
                esql: { filter: { term: { event_type: 'query.esql' } } },
                narration_total: { filter: { term: { event_type: 'narration' } } },
              },
            }),
            safeSearch(es, logger, {
              index: SOPS_INDEX,
              size: 0,
              track_total_hits: true,
              // `confidence` is stored as a 0..1 float but the index mapping types it
              // as `long`, so a plain `avg` agg on the field truncates every value to 0
              // (→ avg 0). Read the original value from `_source` via a runtime `double`
              // field so the average reflects the real fractional confidences. This needs
              // no reindex of the user's data.
              runtime_mappings: {
                confidence_double: {
                  type: 'double',
                  script: {
                    source:
                      "if (params._source.confidence != null) { emit(((Number) params._source.confidence).doubleValue()); }",
                  },
                },
              },
              aggs: {
                avg_confidence: { avg: { field: 'confidence_double' } },
                by_via: { terms: { field: 'generated_via.keyword', size: 10 } },
                by_workflow_via: { terms: { field: 'workflow_generated_via.keyword', size: 10 } },
                distinct_tools: { cardinality: { field: 'tool_ids.keyword' } },
                activity: {
                  date_histogram: {
                    field: 'created_at',
                    calendar_interval: 'day',
                    min_doc_count: 1,
                  },
                },
              },
            }),
            safeSearch(es, logger, {
              index: MEDIA_INDEX,
              size: 0,
              track_total_hits: true,
              aggs: {
                by_type: { terms: { field: 'media_type', size: 10 } },
                total_bytes: { sum: { field: 'size_bytes' } },
              },
            }),
            safeSearch(es, logger, {
              index: DEPLOYMENTS_INDEX,
              size: 0,
              track_total_hits: true,
              aggs: { by_type: { terms: { field: 'type.keyword', size: 10 } } },
            }),
            safeSearch(es, logger, { index: EMBEDDINGS_INDEX, size: 0, track_total_hits: true }),
          ]);

        const sessAggs = sessionsRes.aggregations ?? {};
        const evAggs = eventsRes.aggregations ?? {};
        const sopAggs = sopsRes.aggregations ?? {};
        const mediaByType = termsToMap(mediaRes.aggregations?.by_type);

        const narrationTotal = evAggs.narration_total?.doc_count ?? 0;

        // Voice vs typed narration cannot be aggregated server-side: `details` is mapped
        // as `{ type: object, enabled: false }`, so `details.source` is stored in `_source`
        // but NOT indexed — a `term` filter on it always returns 0 (which is why voice
        // previously showed 0 and every narration was miscounted as "typed"). Instead we
        // fetch just the narration docs' `details.source` from `_source` and tally in JS.
        // Bounded by `narrationTotal` (fetch nothing when there are no narrations).
        let voiceCount = 0;
        if (narrationTotal > 0) {
          const narrationDocs = await safeSearch(es, logger, {
            index: EVENTS_INDEX,
            size: narrationTotal,
            track_total_hits: false,
            _source: ['details.source'],
            query: { term: { event_type: 'narration' } },
          });
          for (const hit of narrationDocs.hits?.hits ?? []) {
            if (hit?._source?.details?.source === 'voice') voiceCount += 1;
          }
        }

        // Merge session-start and sop-created day buckets into one timeline.
        const activityMap = new Map<string, { sessions: number; sops: number }>();
        for (const b of sessAggs.activity?.buckets ?? []) {
          const date = b.key_as_string?.slice(0, 10) ?? String(b.key);
          activityMap.set(date, { sessions: b.doc_count, sops: 0 });
        }
        for (const b of sopAggs.activity?.buckets ?? []) {
          const date = b.key_as_string?.slice(0, 10) ?? String(b.key);
          const cur = activityMap.get(date) ?? { sessions: 0, sops: 0 };
          cur.sops = b.doc_count;
          activityMap.set(date, cur);
        }
        const activity = [...activityMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ date, sessions: v.sessions, sops: v.sops }));


        const metrics: OverviewMetrics = {
          sessions: {
            total: sessionsRes.hits?.total?.value ?? 0,
            by_status: termsToMap(sessAggs.by_status),
            by_type: termsToMap(sessAggs.by_type),
            by_analyst: termsToMap(sessAggs.by_analyst),
          },
          events: {
            total: eventsRes.hits?.total?.value ?? 0,
            by_category: termsToMap(evAggs.by_category),
            voice_segments: voiceCount,
            typed_narrations: Math.max(0, narrationTotal - voiceCount),
            esql_queries: evAggs.esql?.doc_count ?? 0,
          },
          sops: {
            total: sopsRes.hits?.total?.value ?? 0,
            avg_confidence: sopAggs.avg_confidence?.value ?? 0,
            by_generated_via: termsToMap(sopAggs.by_via),
            by_workflow_via: termsToMap(sopAggs.by_workflow_via),
            distinct_tools: sopAggs.distinct_tools?.value ?? 0,
          },
          media: {
            video_count: mediaByType.video ?? 0,
            audio_count: mediaByType.audio ?? 0,
            frame_count: mediaByType.frame ?? 0,
            total_bytes: mediaRes.aggregations?.total_bytes?.value ?? 0,
          },
          deployments: {
            total: deploymentsRes.hits?.total?.value ?? 0,
            by_type: termsToMap(deploymentsRes.aggregations?.by_type),
          },
          embedded_sessions: embeddingsRes.hits?.total?.value ?? 0,
          activity,
        };

        return response.ok({ body: metrics });
      } catch (error: any) {
        logger.error(`Failed to compute overview metrics: ${error.message}`);
        return response.customError({ statusCode: 500, body: { message: error.message } });
      }
    }
  );
}
