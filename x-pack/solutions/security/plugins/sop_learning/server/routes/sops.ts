/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { API_BASE, SESSIONS_INDEX } from '../../common';
import type { RouteDeps } from '.';
import { runSynthesis } from './synthesize';

const SOPS_INDEX = `${SESSIONS_INDEX}-sops`;

/**
 * CRUD for synthesized SOPs: single-fetch, edit name/description, delete, and
 * re-synthesize (re-run synthesis from the SOP's source sessions, updating the
 * SAME document in place). The list/create routes live in `synthesize.ts`; this
 * file adds the mutate/delete + single-get surface that the SOP browser needs.
 */
export function registerSopRoutes(router: IRouter, logger: Logger, deps: RouteDeps) {
  // Fetch a single SOP (handy for refresh-after-edit / refresh-after-resynth).
  router.get(
    {
      path: `${API_BASE}/sops/{sopId}`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: { params: schema.object({ sopId: schema.string() }) },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { sopId } = request.params;
        const doc = await esClient.get({ index: SOPS_INDEX, id: sopId });
        // Strip the dense_vector so the client never has to carry 1024 floats.
        const { vector, ...rest } = (doc._source as Record<string, unknown>) ?? {};
        return response.ok({ body: { sop: { ...rest, id: doc._id } } });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to fetch SOP ${request.params.sopId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );

  // Update editable SOP metadata: name and description only. Steps, outputs,
  // provenance, and the embedding vector are left intact.
  router.patch(
    {
      path: `${API_BASE}/sops/{sopId}`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        params: schema.object({ sopId: schema.string() }),
        body: schema.object({
          name: schema.maybe(schema.string()),
          description: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { sopId } = request.params;
        const { name, description } = request.body;

        const doc: Record<string, unknown> = {};
        if (name !== undefined) doc.name = name;
        if (description !== undefined) doc.description = description;

        if (Object.keys(doc).length === 0) {
          return response.badRequest({
            body: { message: 'Provide at least one of name or description.' },
          });
        }
        doc.updated_at = new Date().toISOString();

        await esClient.update({ index: SOPS_INDEX, id: sopId, doc, refresh: 'wait_for' });

        const updated = await esClient.get({ index: SOPS_INDEX, id: sopId });
        const { vector, ...rest } = (updated._source as Record<string, unknown>) ?? {};
        return response.ok({ body: { sop: { ...rest, id: updated._id } } });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to update SOP ${request.params.sopId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );

  // Delete a SOP. The SOP's embedding vector lives in the SOP doc itself
  // (`-sops` has a `vector` dense_vector field), so deleting the doc removes the
  // vector too — no separate embedding doc to clean up. 404-tolerant.
  router.delete(
    {
      path: `${API_BASE}/sops/{sopId}`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: { params: schema.object({ sopId: schema.string() }) },
    },
    async (context, request, response) => {
      const { sopId } = request.params;
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        await esClient
          .delete({ index: SOPS_INDEX, id: sopId, refresh: 'wait_for' })
          .catch((e: any) => {
            if (e?.meta?.statusCode !== 404) throw e;
          });
        logger.info(`Deleted SOP ${sopId}`);
        return response.ok({ body: { deleted: true, sop_id: sopId } });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to delete SOP ${sopId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );

  // Bulk-delete SOPs. POST `_bulk_delete` with `{ ids }` (some HTTP layers strip
  // DELETE bodies). A single `bulk` delete removes the SOP docs; each doc's
  // in-doc embedding vector goes with it. Tolerant of missing ids.
  router.post(
    {
      path: `${API_BASE}/sops/_bulk_delete`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: { body: schema.object({ ids: schema.arrayOf(schema.string()) }) },
    },
    async (context, request, response) => {
      const { ids } = request.body;
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        if (ids.length === 0) {
          return response.ok({ body: { deleted: 0 } });
        }

        const bulkResult = await esClient.bulk({
          refresh: 'wait_for',
          operations: ids.map((id) => ({ delete: { _index: SOPS_INDEX, _id: id } })),
        });

        const deleted = (bulkResult.items ?? []).filter(
          (item: any) => item.delete?.result === 'deleted'
        ).length;

        logger.info(`Bulk-deleted ${deleted}/${ids.length} SOPs`);
        return response.ok({ body: { deleted } });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to bulk-delete SOPs: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );

  // Re-synthesize a SOP: re-run synthesis from the SOP's stored source_sessions
  // with a (possibly new) connector, replacing this SOP's steps/outputs/
  // provenance in place (same id, original created_at preserved). Optionally
  // override name/description in the same call.
  router.post(
    {
      path: `${API_BASE}/sops/{sopId}/resynthesize`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      // Re-synthesis runs the same multi-LLM pipeline; raise idle socket timeout.
      options: { timeout: { idleSocket: 15 * 60 * 1000 } },
      validate: {
        params: schema.object({ sopId: schema.string() }),
        body: schema.object({
          connector_id: schema.string(),
          name: schema.maybe(schema.string()),
          description: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      const { sopId } = request.params;
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { connector_id, name, description } = request.body;

        // Load the existing SOP to recover its source sessions and defaults.
        let existing: Record<string, unknown>;
        try {
          const doc = await esClient.get({ index: SOPS_INDEX, id: sopId });
          existing = (doc._source as Record<string, unknown>) ?? {};
        } catch (e: any) {
          if (e?.meta?.statusCode === 404) {
            return response.notFound({ body: { message: `SOP ${sopId} not found` } });
          }
          throw e;
        }

        const sourceSessions =
          (existing.source_sessions as string[] | undefined) ??
          (existing.session_ids as string[] | undefined) ??
          [];
        if (!Array.isArray(sourceSessions) || sourceSessions.length === 0) {
          return response.badRequest({
            body: { message: `SOP ${sopId} has no source_sessions to re-synthesize from.` },
          });
        }

        const sop = await runSynthesis({
          esClient,
          request,
          deps,
          logger,
          session_ids: sourceSessions,
          name: name ?? (existing.name as string) ?? 'Untitled SOP',
          description: description ?? (existing.description as string) ?? '',
          connector_id,
          existingSopId: sopId,
          createdAt: (existing.created_at as string) ?? undefined,
        });

        return response.ok({ body: { sop } });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to re-synthesize SOP ${sopId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );
}
