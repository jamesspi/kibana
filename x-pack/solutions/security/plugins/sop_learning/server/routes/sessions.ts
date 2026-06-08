import { IRouter, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { API_BASE, SESSIONS_INDEX } from '../../common';

export function registerSessionsRoutes(router: IRouter, logger: Logger) {
  // List all recording sessions
  router.get(
    {
      path: `${API_BASE}/sessions`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        query: schema.object({
          status: schema.maybe(schema.string()),
          limit: schema.maybe(schema.number({ defaultValue: 50 })),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { status, limit } = request.query;

        const body = await esClient.search({
          index: SESSIONS_INDEX,
          size: limit ?? 50,
          sort: [{ started_at: { order: 'desc' } }],
          query: status ? { term: { status } } : { match_all: {} },
        });

        const sessions = body.hits.hits.map((hit) => ({
          id: hit._id,
          ...(hit._source as Record<string, unknown>),
        }));

        return response.ok({ body: { sessions } });
      } catch (error: any) {
        if (error?.meta?.statusCode === 404) {
          return response.ok({ body: { sessions: [] } });
        }
        logger.error(`Failed to fetch sessions: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );

  // Get a single session with all its events
  router.get(
    {
      path: `${API_BASE}/sessions/{sessionId}`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        params: schema.object({
          sessionId: schema.string(),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { sessionId } = request.params;

        const [sessionResult, eventsResult] = await Promise.all([
          esClient.get({ index: SESSIONS_INDEX, id: sessionId }),
          esClient.search({
            index: `${SESSIONS_INDEX}-events`,
            size: 500,
            sort: [{ '@timestamp': { order: 'asc' } }],
            query: { term: { session_id: sessionId } },
          }),
        ]);

        const session = {
          id: sessionResult._id,
          ...(sessionResult._source as Record<string, unknown>),
        };
        const events = eventsResult.hits.hits.map((hit) => hit._source);

        return response.ok({ body: { session, events } });
      } catch (error: any) {
        logger.error(`Failed to fetch session ${request.params.sessionId}: ${error.message}`);
        return response.customError({
          statusCode: error?.meta?.statusCode ?? 500,
          body: { message: error.message },
        });
      }
    }
  );

  // Get sessions from audit logs (reconstructed)
  router.get(
    {
      path: `${API_BASE}/sessions/from-audit`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        query: schema.object({
          hours: schema.maybe(schema.number({ defaultValue: 24 })),
          user: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { hours, user } = request.query;

        const securityActions = [
          'alert_get',
          'alert_find',
          'rule_alert_acknowledge',
          'case_get',
          'case_create',
          'case_update',
          'case_user_actions_get',
          'saved_object_find',
          'saved_object_get',
        ];

        const must: any[] = [
          { range: { '@timestamp': { gte: `now-${hours}h` } } },
          { terms: { 'event.action': securityActions } },
        ];

        if (user) {
          must.push({ term: { 'user.name': user } });
        }

        const body = await esClient.search({
          index: '.kibana-audit-*',
          size: 0,
          query: { bool: { must } },
          aggs: {
            by_user: {
              terms: { field: 'user.name', size: 20 },
              aggs: {
                by_trace: {
                  terms: { field: 'trace.id', size: 100 },
                  aggs: {
                    first_event: { min: { field: '@timestamp' } },
                    last_event: { max: { field: '@timestamp' } },
                    actions: { terms: { field: 'event.action', size: 50 } },
                  },
                },
              },
            },
          },
        });

        const aggregations = body.aggregations as any;
        const sessions: any[] = [];

        for (const userBucket of aggregations?.by_user?.buckets ?? []) {
          for (const traceBucket of userBucket.by_trace?.buckets ?? []) {
            if (traceBucket.doc_count < 2) continue;
            sessions.push({
              trace_id: traceBucket.key,
              analyst: userBucket.key,
              started_at: traceBucket.first_event?.value_as_string,
              ended_at: traceBucket.last_event?.value_as_string,
              event_count: traceBucket.doc_count,
              actions: traceBucket.actions?.buckets?.map((b: any) => ({
                action: b.key,
                count: b.doc_count,
              })),
            });
          }
        }

        sessions.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

        return response.ok({ body: { sessions } });
      } catch (error: any) {
        logger.error(`Failed to fetch audit sessions: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );

  // Update editable session metadata. Only the workflow label/type can be
  // changed by an analyst; analyst identity, status, and counts are immutable.
  router.patch(
    {
      path: `${API_BASE}/sessions/{sessionId}`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        params: schema.object({ sessionId: schema.string() }),
        body: schema.object({
          workflow_label: schema.maybe(schema.string()),
          workflow_type: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { sessionId } = request.params;
        const { workflow_label, workflow_type } = request.body;

        const doc: Record<string, unknown> = {};
        if (workflow_label !== undefined) doc.workflow_label = workflow_label;
        if (workflow_type !== undefined) doc.workflow_type = workflow_type;

        if (Object.keys(doc).length === 0) {
          return response.badRequest({
            body: { message: 'Provide at least one of workflow_label or workflow_type.' },
          });
        }

        await esClient.update({
          index: SESSIONS_INDEX,
          id: sessionId,
          doc,
          refresh: 'wait_for',
        });

        const updated = await esClient.get({ index: SESSIONS_INDEX, id: sessionId });
        return response.ok({
          body: { session: { id: updated._id, ...(updated._source as Record<string, unknown>) } },
        });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to update session ${request.params.sessionId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );

  // Delete a session and CASCADE-delete everything derived from it: its events
  // (`-events`), its media chunks (`-media`), and its embedding (`-embeddings`).
  // 404-tolerant: a missing session/index is treated as already deleted so the
  // call is idempotent.
  router.delete(
    {
      path: `${API_BASE}/sessions/{sessionId}`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        params: schema.object({ sessionId: schema.string() }),
      },
    },
    async (context, request, response) => {
      const { sessionId } = request.params;
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        // Delete the session doc itself (ignore 404).
        await esClient
          .delete({ index: SESSIONS_INDEX, id: sessionId, refresh: 'wait_for' })
          .catch((e: any) => {
            if (e?.meta?.statusCode !== 404) throw e;
          });

        // Cascade-delete derived data. deleteByQuery is 404-tolerant via
        // ignore_unavailable + allow_no_indices so a never-created child index
        // is not an error.
        const cascade = async (indexSuffix: string, idField = 'session_id') => {
          try {
            const r = await esClient.deleteByQuery({
              index: `${SESSIONS_INDEX}${indexSuffix}`,
              query: { term: { [idField]: sessionId } },
              refresh: true,
              conflicts: 'proceed',
              ignore_unavailable: true,
              allow_no_indices: true,
            } as any);
            return r.deleted ?? 0;
          } catch (e: any) {
            if (e?.meta?.statusCode === 404) return 0;
            throw e;
          }
        };

        const eventsDeleted = await cascade('-events');
        const mediaDeleted = await cascade('-media');
        // Embeddings are stored one-doc-per-session keyed by session_id (the ES
        // _id is the session id), so delete by id and also by query as a belt.
        await esClient
          .delete({ index: `${SESSIONS_INDEX}-embeddings`, id: sessionId, refresh: 'wait_for' })
          .catch((e: any) => {
            if (e?.meta?.statusCode !== 404) throw e;
          });
        const embeddingsDeleted = await cascade('-embeddings');

        logger.info(
          `Deleted session ${sessionId} and cascaded: events=${eventsDeleted}, ` +
            `media=${mediaDeleted}, embeddings(by_query)=${embeddingsDeleted}`
        );

        return response.ok({
          body: {
            deleted: true,
            session_id: sessionId,
            events_deleted: eventsDeleted,
            media_deleted: mediaDeleted,
          },
        });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to delete session ${sessionId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );

  // Bulk-delete sessions and CASCADE-delete everything derived from them. Uses
  // POST `_bulk_delete` (some HTTP layers strip DELETE bodies) with a body of
  // `{ ids }`. Implemented efficiently: a single `deleteByQuery` with a `terms`
  // filter handles the events/media/embeddings cascade, and a single `bulk`
  // request deletes the session docs. Tolerant of missing ids/indices.
  router.post(
    {
      path: `${API_BASE}/sessions/_bulk_delete`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({ ids: schema.arrayOf(schema.string()) }),
      },
    },
    async (context, request, response) => {
      const { ids } = request.body;
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        if (ids.length === 0) {
          return response.ok({
            body: { deleted: 0, events_deleted: 0, media_deleted: 0 },
          });
        }

        // Cascade-delete derived data in one deleteByQuery per child index using
        // a `terms` filter. ignore_unavailable + allow_no_indices make a
        // never-created child index a no-op rather than an error.
        const cascade = async (indexSuffix: string, idField = 'session_id') => {
          try {
            const r = await esClient.deleteByQuery({
              index: `${SESSIONS_INDEX}${indexSuffix}`,
              query: { terms: { [idField]: ids } },
              refresh: true,
              conflicts: 'proceed',
              ignore_unavailable: true,
              allow_no_indices: true,
            } as any);
            return r.deleted ?? 0;
          } catch (e: any) {
            if (e?.meta?.statusCode === 404) return 0;
            throw e;
          }
        };

        const eventsDeleted = await cascade('-events');
        const mediaDeleted = await cascade('-media');
        // Embeddings are keyed by session_id (ES _id === session id). Delete by
        // query as a belt-and-suspenders alongside the bulk session deletes.
        await cascade('-embeddings');
        await cascade('-embeddings', '_id').catch(() => 0);

        // Bulk-delete the session docs themselves. A missing doc shows up as a
        // per-item 404 in the response, which we tolerate (idempotent).
        const bulkResult = await esClient.bulk({
          refresh: 'wait_for',
          operations: ids.map((id) => ({ delete: { _index: SESSIONS_INDEX, _id: id } })),
        });

        // Also delete the embedding docs by id (keyed by session id).
        await esClient
          .bulk({
            refresh: 'wait_for',
            operations: ids.map((id) => ({
              delete: { _index: `${SESSIONS_INDEX}-embeddings`, _id: id },
            })),
          })
          .catch(() => undefined);

        const deleted = (bulkResult.items ?? []).filter(
          (item: any) => item.delete?.result === 'deleted'
        ).length;

        logger.info(
          `Bulk-deleted ${deleted}/${ids.length} sessions and cascaded: ` +
            `events=${eventsDeleted}, media=${mediaDeleted}`
        );

        return response.ok({
          body: {
            deleted,
            events_deleted: eventsDeleted,
            media_deleted: mediaDeleted,
          },
        });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to bulk-delete sessions: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );
}
