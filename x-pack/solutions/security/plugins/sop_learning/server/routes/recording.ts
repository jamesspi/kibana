/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { RecordingSession, RecordedEvent } from '../../common';
import { API_BASE, SESSIONS_INDEX } from '../../common';

export function registerRecordingRoutes(router: IRouter, logger: Logger) {
  // Start a new recording session
  router.post(
    {
      path: `${API_BASE}/recording/start`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          workflow_type: schema.string(),
          workflow_label: schema.string(),
        }),
      },
    },
    async (context, request, response) => {
      try {
        // Plugin-managed `sop-learning-*` indices are written as the current
        // (authorized) user. The route is gated by the `sopLearning` feature
        // privilege; the analyst's role must also grant write access to the
        // `sop-learning-*` indices (kibana_system / asInternalUser does NOT
        // have write access to these custom indices, so it can't be used here).
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const coreContext = await context.core;
        const currentUser = coreContext.security?.authc.getCurrentUser();

        const session: Omit<RecordingSession, 'id'> = {
          analyst_id: currentUser?.username ?? 'unknown',
          analyst_name: currentUser?.full_name ?? currentUser?.username ?? 'Unknown Analyst',
          started_at: new Date().toISOString(),
          workflow_type: request.body.workflow_type,
          workflow_label: request.body.workflow_label,
          status: 'recording',
          event_count: 0,
        };

        const result = await esClient.index({
          index: SESSIONS_INDEX,
          document: session,
          refresh: 'wait_for',
        });

        logger.info(`Recording started: session ${result._id} by ${session.analyst_name}`);

        return response.ok({
          body: { session: { id: result._id, ...session } },
        });
      } catch (error: any) {
        logger.error(`Failed to start recording: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );

  // Record an event during active session
  router.post(
    {
      path: `${API_BASE}/recording/event`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          session_id: schema.string(),
          event_type: schema.string(),
          category: schema.string(),
          description: schema.string(),
          details: schema.maybe(schema.recordOf(schema.string(), schema.any())),
          narration: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { session_id, event_type, category, description, details, narration } = request.body;

        const event: RecordedEvent = {
          '@timestamp': new Date().toISOString(),
          session_id,
          event_type,
          category,
          description,
          details: details ?? {},
          narration,
        };

        await esClient.index({
          index: `${SESSIONS_INDEX}-events`,
          document: event,
          refresh: 'wait_for',
        });

        // Update session event count (fire-and-forget — don't block event recording)
        esClient
          .update({
            index: SESSIONS_INDEX,
            id: session_id,
            retry_on_conflict: 10,
            script: {
              source: 'ctx._source.event_count += 1',
              lang: 'painless',
            },
          })
          .catch(() => {});

        return response.ok({ body: { recorded: true } });
      } catch (error: any) {
        logger.error(`Failed to record event: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );

  // Stop a recording session
  router.post(
    {
      path: `${API_BASE}/recording/stop`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          session_id: schema.string(),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { session_id } = request.body;

        await esClient.update({
          index: SESSIONS_INDEX,
          id: session_id,
          doc: {
            status: 'completed',
            ended_at: new Date().toISOString(),
          },
          refresh: 'wait_for',
        });

        logger.info(`Recording stopped: session ${session_id}`);

        return response.ok({ body: { stopped: true } });
      } catch (error: any) {
        logger.error(`Failed to stop recording: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );

  // Add narration annotation to current session. Two kinds:
  //  - typed narration (source omitted/'typed'): analyst typed reasoning
  //  - voice transcript (source='voice'): browser Web Speech API recognized a
  //    spoken segment, with audio_start_ms/audio_end_ms offsets from rec start.
  // Both are stored as event_type 'narration' so existing readers keep working;
  // `details.source` distinguishes them and synthesis splits accordingly.
  router.post(
    {
      path: `${API_BASE}/recording/narrate`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          session_id: schema.string(),
          text: schema.string(),
          context_event_type: schema.maybe(schema.string()),
          source: schema.maybe(schema.oneOf([schema.literal('typed'), schema.literal('voice')])),
          audio_start_ms: schema.maybe(schema.number()),
          audio_end_ms: schema.maybe(schema.number()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { session_id, text, context_event_type, source, audio_start_ms, audio_end_ms } =
          request.body;
        const kind = source ?? 'typed';

        await esClient.index({
          index: `${SESSIONS_INDEX}-events`,
          document: {
            '@timestamp': new Date().toISOString(),
            session_id,
            event_type: 'narration',
            category: 'annotation',
            description: text,
            details: { context_event_type, source: kind },
            narration: text,
            ...(typeof audio_start_ms === 'number' ? { audio_start_ms } : {}),
            ...(typeof audio_end_ms === 'number' ? { audio_end_ms } : {}),
          },
          refresh: 'wait_for',
        });

        return response.ok({ body: { recorded: true } });
      } catch (error: any) {
        logger.error(`Failed to record narration: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );
}
