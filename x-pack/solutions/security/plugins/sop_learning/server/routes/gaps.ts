/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { ToolType } from '@kbn/agent-builder-common';
import { API_BASE, SESSIONS_INDEX } from '../../common';
import type { SynthesizedSOP } from '../../common';
import { buildGapFillProposals } from '../lib/gap_fills';
import type { RouteDeps } from '.';

const SOPS_INDEX = `${SESSIONS_INDEX}-sops`;

/**
 * Capability-gap routes:
 *  - POST /sops/{sopId}/gap-fills          → PROPOSE gap-filling workflow tools
 *    (non-destructive; just generates parameterized Workflow YAML + tool ids).
 *  - POST /sops/{sopId}/gap-fills/create   → CREATE the chosen gap fill: save the
 *    Workflow (Workflows Management) AND register it as an Agent Builder
 *    `workflow` tool, then point the gap step at the new tool_id.
 */
export function registerGapRoutes(router: IRouter, logger: Logger, deps: RouteDeps) {
  // Propose (non-destructive). Returns one proposal per capability-gap step.
  router.post(
    {
      path: `${API_BASE}/sops/{sopId}/gap-fills`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: { params: schema.object({ sopId: schema.string() }) },
    },
    async (context, request, response) => {
      const { sopId } = request.params;
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const doc = await esClient.get({ index: SOPS_INDEX, id: sopId });
        const { vector, ...rest } = (doc._source as Record<string, unknown>) ?? {};
        const sop = { ...(rest as unknown as SynthesizedSOP), id: doc._id! };
        const proposals = buildGapFillProposals(sop);
        return response.ok({ body: { proposals } });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to propose gap fills for SOP ${sopId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );

  // Create the chosen gap-filling artifacts (workflow + workflow tool) and wire
  // the SOP step to the new tool_id. Only feasible proposals can be created.
  router.post(
    {
      path: `${API_BASE}/sops/{sopId}/gap-fills/create`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      options: { timeout: { idleSocket: 5 * 60 * 1000 } },
      validate: {
        params: schema.object({ sopId: schema.string() }),
        body: schema.object({
          step_id: schema.string(),
          workflow_id: schema.string(),
          tool_id: schema.string(),
          yaml: schema.string(),
          description: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      const { sopId } = request.params;
      const { step_id: stepId, tool_id, yaml, description } = request.body;
      try {
        if (!yaml.trim()) {
          return response.badRequest({
            body: {
              message:
                'This capability gap has no native workflow step (e.g. endpoint isolation) and cannot be auto-filled with a workflow tool. It requires a custom connector.',
            },
          });
        }

        const agentBuilder = await deps.getAgentBuilderStart();
        const workflowsApi = deps.getWorkflowsManagementApi();
        if (!agentBuilder) {
          return response.customError({
            statusCode: 503,
            body: { message: 'Agent Builder plugin is not available — cannot register a workflow tool.' },
          });
        }
        if (!workflowsApi) {
          return response.customError({
            statusCode: 503,
            body: { message: 'Workflows Management plugin is not available — cannot save the workflow.' },
          });
        }

        const spaceId = deps.getSpaceId(request);

        // 1. Save the Workflow (Workflows Management create API takes YAML).
        const created = await workflowsApi.createWorkflow({ yaml }, spaceId, request);
        const savedWorkflowId = created.id;
        logger.info(`Gap-fill: created workflow ${savedWorkflowId} for SOP ${sopId} step ${stepId}`);

        // 2. Register it as an Agent Builder `workflow` tool.
        const registry = await agentBuilder.tools.getRegistry({ request });
        let registeredToolId = tool_id;
        try {
          const tool = await registry.create({
            id: tool_id,
            type: ToolType.workflow,
            description: description ?? `Gap-filling workflow tool for SOP step ${stepId}`,
            tags: ['sop-learning', 'gap-fill'],
            configuration: { workflow_id: savedWorkflowId },
          });
          registeredToolId = tool.id;
        } catch (toolErr: any) {
          // Roll back the orphaned workflow so we don't leave dangling artifacts.
          logger.warn(
            `Gap-fill: tool registration failed (${toolErr.message}); deleting orphaned workflow ${savedWorkflowId}.`
          );
          await workflowsApi.deleteWorkflows([savedWorkflowId], spaceId, request).catch(() => {});
          throw toolErr;
        }

        // 3. Point the gap step at the new tool_id and clear the gap.
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const doc = await esClient.get({ index: SOPS_INDEX, id: sopId });
        const source = (doc._source as Record<string, unknown>) ?? {};
        const steps = ((source.steps as SynthesizedSOP['steps']) ?? []).map((s) =>
          s.id === stepId
            ? { ...s, tool_id: registeredToolId, capability_gap: undefined }
            : s
        );
        const toolIds = Array.from(
          new Set(steps.map((s) => s.tool_id).filter((t): t is string => !!t))
        );
        await esClient.update({
          index: SOPS_INDEX,
          id: sopId,
          doc: { steps, tool_ids: toolIds, updated_at: new Date().toISOString() },
          refresh: 'wait_for',
        });

        return response.ok({
          body: {
            created: true,
            workflow_id: savedWorkflowId,
            tool_id: registeredToolId,
            step_id: stepId,
          },
        });
      } catch (error: any) {
        const statusCode = error?.meta?.statusCode ?? 500;
        logger.error(`Failed to create gap fill for SOP ${sopId}: ${error.message}`);
        return response.customError({ statusCode, body: { message: error.message } });
      }
    }
  );
}
