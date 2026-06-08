/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { firstValueFrom, filter, map } from 'rxjs';
import {
  AgentExecutionMode,
  agentBuilderDefaultAgentId,
  isRoundCompleteEvent,
} from '@kbn/agent-builder-common';
import { API_BASE, SESSIONS_INDEX } from '../../common';
import type { SynthesizedSOP } from '../../common';
import { AGENT_TOOL_CATALOG } from '../lib/synthesis';
import type { RouteDeps } from '.';

const SOPS_INDEX = `${SESSIONS_INDEX}-sops`;

/** tool_ids in the catalog that are READ-ONLY (safe for a dry-run preview). */
const READ_ONLY_TOOL_IDS = new Set(
  AGENT_TOOL_CATALOG.filter((t) => t.capability === 'read').map((t) => t.tool_id)
);

/**
 * Skill PREVIEW (real dry-run): run the SOP's skill as a one-off Agent Builder
 * conversation round via the execution service (same engine that backs
 * `POST /api/agent_builder/converse`), using:
 *  - `configurationOverrides.instructions` = the skill markdown (inlined — no
 *     need to save a skill), and
 *  - `configurationOverrides.tools`        = the SOP's tool_ids RESTRICTED TO
 *     READ-ONLY tools, so the preview can NEVER fire a write/isolate/case-create
 *     tool. We surface which tools were excluded for safety.
 *
 * Returns the agent's tool-call steps + final message so the user sees what the
 * skill would actually output. Clearly a read-only dry-run.
 */
export function registerPreviewRoutes(router: IRouter, logger: Logger, deps: RouteDeps) {
  router.post(
    {
      path: `${API_BASE}/sops/{sopId}/preview`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      // Mirror the agent_builder chat route's long idle socket timeout.
      options: { timeout: { idleSocket: 15 * 60 * 1000 } },
      validate: {
        params: schema.object({ sopId: schema.string() }),
        body: schema.object({
          connector_id: schema.string(),
          // Free-form sample input describing the alert, e.g. "a critical
          // malware alert on a host". Optional — we provide a default.
          sample_input: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      const { sopId } = request.params;
      const { connector_id, sample_input } = request.body;
      try {
        const agentBuilder = await deps.getAgentBuilderStart();
        if (!agentBuilder) {
          return response.customError({
            statusCode: 503,
            body: { message: 'Agent Builder plugin is not available — cannot run a preview.' },
          });
        }

        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const doc = await esClient.get({ index: SOPS_INDEX, id: sopId });
        const sop = (doc._source as unknown) as SynthesizedSOP;

        const instructions = sop.skill_output;
        if (!instructions || !instructions.trim()) {
          return response.badRequest({
            body: { message: 'This SOP has no skill content to preview.' },
          });
        }

        // SAFETY: restrict to READ-ONLY tools the SOP references. Any write /
        // gap-filled tool is excluded so the dry-run never mutates state.
        const sopToolIds = sop.tool_ids ?? [];
        const safeToolIds = sopToolIds.filter((t) => READ_ONLY_TOOL_IDS.has(t));
        const excludedToolIds = sopToolIds.filter((t) => !READ_ONLY_TOOL_IDS.has(t));

        const sampleInput =
          sample_input?.trim() ||
          'A new high/critical security alert has just fired. Execute this procedure against it and report what you find.';

        const previewMessage =
          `[READ-ONLY DRY RUN] ${sampleInput}\n\n` +
          `Run the procedure in your instructions. You may ONLY use the read-only tools provided; ` +
          `do not attempt any write/response action (those are disabled for this preview).`;

        const abortController = new AbortController();
        request.events.aborted$.subscribe(() => abortController.abort());

        logger.info(
          `Skill preview for SOP ${sopId}: connector="${connector_id}", ` +
            `tools=[${safeToolIds.join(', ')}], excluded_for_safety=[${excludedToolIds.join(', ')}].`
        );

        const { events$ } = await agentBuilder.execution.executeAgent({
          mode: AgentExecutionMode.standalone,
          request,
          abortSignal: abortController.signal,
          metadata: { source: 'sop_learning_preview' },
          params: {
            agentId: agentBuilderDefaultAgentId,
            ...(connector_id ? { connectorId: connector_id } : {}),
            nextInput: { message: previewMessage },
            configurationOverrides: {
              instructions,
              // Empty selection => no tools at all (safer than all tools) when
              // the SOP has no read-only tools to offer.
              tools: [{ tool_ids: safeToolIds }],
            },
          },
        });

        const round = await firstValueFrom(
          events$.pipe(
            filter(isRoundCompleteEvent),
            map((event) => event.data.round)
          )
        );

        // Extract the tool-call steps and the final message for display.
        const steps = Array.isArray((round as any).steps) ? (round as any).steps : [];
        const toolCalls = steps
          .filter((s: any) => s?.type === 'tool_call')
          .map((s: any) => ({
            tool_id: s.tool_id,
            params: s.params,
            result_summary: summarizeResults(s.results),
          }));
        const finalMessage = (round.response as any)?.message ?? '';

        return response.ok({
          body: {
            dry_run: true,
            read_only: true,
            tools_used: safeToolIds,
            tools_excluded_for_safety: excludedToolIds,
            sample_input: sampleInput,
            tool_calls: toolCalls,
            final_message: finalMessage,
          },
        });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Skill preview failed for SOP ${sopId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );
}

/** Compact a tool's ToolResult[] into a short string for the preview UI. */
function summarizeResults(results: any): string {
  if (!Array.isArray(results)) return '';
  try {
    const parts = results.map((r) => {
      if (r?.type === 'query' && r?.data?.query) return `query: ${r.data.query}`;
      if (r?.type === 'tabular_data' && r?.data?.values)
        return `${r.data.values.length} row(s)`;
      if (r?.type === 'other' && r?.data) return JSON.stringify(r.data).slice(0, 200);
      return r?.type ?? 'result';
    });
    return parts.join('; ').slice(0, 500);
  } catch {
    return '';
  }
}
