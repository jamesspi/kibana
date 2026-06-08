/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger, KibanaRequest, ElasticsearchClient } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { MessageRole } from '@kbn/inference-common';
import { firstValueFrom, filter, map } from 'rxjs';
import {
  AgentExecutionMode,
  agentBuilderDefaultAgentId,
  isRoundCompleteEvent,
} from '@kbn/agent-builder-common';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import { API_BASE, SESSIONS_INDEX } from '../../common';
import type { SynthesizedSOP } from '../../common';
import { buildSynthesisPrompt, parseSOPFromLLM, buildProvenanceSummary } from '../lib/synthesis';
import { authorWorkflowYaml } from '../lib/workflow_authoring';
import {
  buildFramePromptSection,
  buildMultimodalContent,
  capFrames,
  type SynthesisFrame,
} from '../lib/frames';
import { embedText, EMBEDDING_DIMS } from './embeddings';
import type { RouteDeps } from '.';

/**
 * JSON Schema describing the structured SOP the synthesis prompt asks for.
 * Passed to Agent Builder as `outputSchema` so the agent is forced (via
 * `withStructuredOutput`) to emit JSON our `parseSOPFromLLM` can consume —
 * identical shape to the text-only prompt's "Produce a structured SOP in
 * EXACTLY this JSON format" contract.
 */
const SOP_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'number' },
          name: { type: 'string' },
          description: { type: 'string' },
          action_type: {
            type: 'string',
            enum: ['query', 'enrichment', 'decision', 'response_action', 'case_action', 'manual'],
          },
          tool_id: { type: 'string' },
          tool_params: { type: 'string' },
          query_template: { type: 'string' },
          capability_gap: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              reason: { type: 'string' },
              suggested_fill: {
                type: 'string',
                enum: ['workflow_tool', 'connector_sub_action', 'custom_connector'],
              },
            },
          },
          intent: { type: 'string' },
          confidence: { type: 'number' },
          is_optional: { type: 'boolean' },
          provenance: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['ui_action', 'voice', 'typed', 'frame'] },
                ref: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['type'],
            },
          },
        },
        required: ['name', 'description', 'action_type', 'confidence', 'is_optional'],
      },
    },
    trigger_conditions: { type: 'string' },
    expected_duration_minutes: { type: 'number' },
    decision_points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          after_step: { type: 'number' },
          condition: { type: 'string' },
          escalate_to_step: { type: 'number' },
          otherwise: { type: 'string' },
        },
      },
    },
  },
  required: ['steps'],
};

/**
 * Run synthesis through the Elastic Agent Builder agent. The agent reasons with
 * access to the REAL available tools/skills (it is the same engine that will
 * eventually execute the SOP), so the generated step plan is grounded in what
 * an agent can actually do — not just what an LLM imagines.
 *
 * Returns the structured-output JSON string (to be fed to parseSOPFromLLM), or
 * throws so the caller can fall back to a direct LLM call.
 *
 * TRADEOFF: Agent Builder serializes inputs to TEXT only — it cannot carry the
 * base64 screen keyframes as vision content. When frames exist, the caller runs
 * a multimodal vision pre-pass and folds the resulting textual description into
 * `promptText`, so this path still benefits from the on-screen evidence.
 */
async function runAgentBuilderSynthesis(
  agentBuilder: AgentBuilderPluginStart,
  request: KibanaRequest,
  promptText: string,
  connectorId: string
): Promise<string> {
  const abortController = new AbortController();
  request.events.aborted$.subscribe(() => abortController.abort());

  const { events$ } = await agentBuilder.execution.executeAgent({
    mode: AgentExecutionMode.standalone,
    request,
    abortSignal: abortController.signal,
    metadata: { source: 'sop_learning_synthesize' },
    params: {
      agentId: agentBuilderDefaultAgentId,
      // The user-supplied connector resolves the model the agent routes to.
      ...(connectorId ? { connectorId } : {}),
      nextInput: { message: promptText },
      structuredOutput: true,
      outputSchema: SOP_OUTPUT_SCHEMA,
    },
  });

  const round = await firstValueFrom(
    events$.pipe(
      filter(isRoundCompleteEvent),
      map((event) => event.data.round)
    )
  );

  // In structured mode `structured_output` is the parsed object and `message`
  // is its JSON.stringify. parseSOPFromLLM accepts a JSON string, so normalize.
  const structured = (round.response as any)?.structured_output;
  if (structured && typeof structured === 'object') {
    return JSON.stringify(structured);
  }
  const message = round.response?.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  throw new Error('Agent Builder returned no structured SOP output');
}

/**
 * Core synthesis routine shared by `POST /synthesize` (creates a brand-new SOP)
 * and `POST /sops/{id}/resynthesize` (re-runs synthesis for an existing SOP and
 * updates it in place). Fetches the session events + screen keyframes, runs the
 * multimodal/Agent-Builder/LLM synthesis, authors the workflow YAML, computes
 * provenance + embedding, and persists the SOP.
 *
 * When `existingSopId` is provided the result is written back to THAT document
 * id (preserving `created_at`); otherwise a new document is created. Returns the
 * stored SOP including its id. Throws on failure so callers map to an HTTP error.
 */
export interface RunSynthesisArgs {
  esClient: ElasticsearchClient;
  request: KibanaRequest;
  deps: RouteDeps;
  logger: Logger;
  session_ids: string[];
  name: string;
  description?: string;
  connector_id: string;
  /** When set, update this SOP doc in place instead of creating a new one. */
  existingSopId?: string;
  /** Preserve the original creation timestamp when re-synthesizing. */
  createdAt?: string;
}

export async function runSynthesis(
  args: RunSynthesisArgs
): Promise<SynthesizedSOP & { id: string }> {
  const { esClient, request, deps, logger, session_ids, name, description, connector_id } = args;

  // Fetch all events for the specified sessions
  const eventsResult = await esClient.search({
    index: `${SESSIONS_INDEX}-events`,
    size: 2000,
    sort: [{ '@timestamp': { order: 'asc' } }],
    query: { terms: { session_id: session_ids } },
  });

  const events = eventsResult.hits.hits.map((hit) => hit._source as any);

  // Group events by session
  const sessionGroups: Record<string, any[]> = {};
  for (const event of events) {
    const sid = event.session_id;
    if (!sessionGroups[sid]) sessionGroups[sid] = [];
    sessionGroups[sid].push(event);
  }

  // Build the LLM prompt
  const prompt = buildSynthesisPrompt(sessionGroups, name, description);

  // Fetch screen keyframes for these sessions and turn them into image
  // content parts for Claude (vision).
  const MAX_FRAMES_TO_SEND = 12;
  let frames: SynthesisFrame[] = [];
  try {
    const framesResult = await esClient.search({
      index: `${SESSIONS_INDEX}-media`,
      size: 500,
      sort: [{ timestamp_ms: { order: 'asc' } }],
      query: {
        bool: {
          filter: [{ terms: { session_id: session_ids } }, { term: { media_type: 'frame' } }],
        },
      },
    });
    const allFrames: SynthesisFrame[] = framesResult.hits.hits.map((hit, i) => {
      const s = hit._source as any;
      const mime = s.mime_type ?? 'image/jpeg';
      const raw: string = s.data ?? '';
      const dataUrl = raw.startsWith('data:') ? raw : `data:${mime};base64,${raw}`;
      return {
        id: `F${i + 1}`,
        timestampMs: typeof s.timestamp_ms === 'number' ? s.timestamp_ms : 0,
        dataUrl,
      };
    });
    frames = capFrames(allFrames, MAX_FRAMES_TO_SEND).map((f, i) => ({
      ...f,
      id: `F${i + 1}`,
    }));
  } catch {
    frames = [];
  }

  const fullPrompt = prompt + buildFramePromptSection(frames);
  const messageContent = buildMultimodalContent(fullPrompt, frames);

  logger.info(
    `Synthesis input for "${name}": sessions=${session_ids.length}, ` +
      `events=${events.length}, frames_fetched=${frames.length}, ` +
      `prompt_chars=${fullPrompt.length}, image_parts=${
        Array.isArray(messageContent) ? messageContent.length - 1 : 0
      }`
  );
  logger.debug(`Synthesis prompt for "${name}":\n${fullPrompt}`);

  const agentBuilder = await deps.getAgentBuilderStart();
  const hasFrames = frames.length > 0;
  const inference = await deps.getInferenceStart();
  const inferenceClient = inference.getClient({ request });

  const callDirectLlm = async (): Promise<string> => {
    const chatResponse = await inferenceClient.chatComplete({
      connectorId: connector_id,
      system:
        'You are an expert security operations analyst. You translate recorded analyst ' +
        'workflows — including the attached screen keyframes when present — into a ' +
        'precise sequence of Elastic Agent Builder tool invocations. You ALWAYS respond ' +
        'with a single valid JSON object and no surrounding prose.',
      messages: [{ role: MessageRole.User, content: messageContent }],
    });
    return typeof chatResponse.content === 'string'
      ? chatResponse.content
      : JSON.stringify(chatResponse.content);
  };

  let llmOutput: string;
  let generatedVia: 'claude_multimodal' | 'agent_builder' | 'llm' = 'llm';
  if (hasFrames) {
    logger.info(
      `Synthesis: CLAUDE MULTIMODAL path — sending ${frames.length} screen keyframe(s) ` +
        `as image content parts to connector "${connector_id}" (vision drives the SOP).`
    );
    llmOutput = await callDirectLlm();
    generatedVia = 'claude_multimodal';
  } else if (agentBuilder) {
    try {
      llmOutput = await runAgentBuilderSynthesis(agentBuilder, request, fullPrompt, connector_id);
      generatedVia = 'agent_builder';
      logger.info('Synthesis produced via Agent Builder (no frames; generated_via=agent_builder).');
    } catch (abError: any) {
      logger.warn(`Agent Builder synthesis failed, falling back to direct LLM: ${abError.message}`);
      llmOutput = await callDirectLlm();
      generatedVia = 'llm';
    }
  } else {
    logger.info(
      'Synthesis: no frames and Agent Builder unavailable; using direct text LLM (generated_via=llm).'
    );
    llmOutput = await callDirectLlm();
    generatedVia = 'llm';
  }

  // Parse the LLM output into structured SOP
  const sop = parseSOPFromLLM(llmOutput, {
    name,
    description: description ?? '',
    session_ids,
  });
  sop.generated_via = generatedVia;

  // Author the Elastic Workflow YAML.
  const workflowsApi = deps.getWorkflowsManagementApi();
  const spaceId = deps.getSpaceId(request);
  const workflowResult = await authorWorkflowYaml({
    sop,
    parsed: {
      trigger_conditions: sop.trigger_conditions,
      decision_points: sop.decision_points,
    },
    request,
    connectorId: connector_id,
    spaceId,
    agentBuilder,
    workflowsApi,
    logger,
  });
  sop.workflow_output = workflowResult.yaml;
  sop.workflow_generated_via = workflowResult.via;
  sop.workflow_generation_note = workflowResult.note;

  // Honest session-level provenance from raw captured events.
  let screenVideoPresent = false;
  try {
    const mediaCount = await esClient.count({
      index: `${SESSIONS_INDEX}-media`,
      query: {
        bool: {
          filter: [{ terms: { session_id: session_ids } }, { term: { media_type: 'video' } }],
        },
      },
    });
    screenVideoPresent = (mediaCount.count ?? 0) > 0;
  } catch {
    screenVideoPresent = false;
  }
  sop.provenance = buildProvenanceSummary(sessionGroups, screenVideoPresent);
  if (sop.provenance) {
    sop.provenance.screen_frame_count = frames.length;
  }

  // Compute an embedding for the SOP so the "similar SOP" check can find it.
  const sopSummaryForEmbedding = [
    sop.name,
    sop.description,
    ...sop.steps.map((s) => `${s.name}: ${s.description}`),
  ]
    .filter(Boolean)
    .join('\n');
  const sopVector = await embedText(esClient, logger, sopSummaryForEmbedding);

  const sopsIndex = `${SESSIONS_INDEX}-sops`;
  if (sopVector) {
    const sopsIndexExists = await esClient.indices.exists({ index: sopsIndex });
    if (!sopsIndexExists) {
      await esClient.indices
        .create({
          index: sopsIndex,
          mappings: {
            properties: {
              vector: {
                type: 'dense_vector',
                dims: EMBEDDING_DIMS,
                index: true,
                similarity: 'cosine',
              },
            },
          },
        })
        .catch(() => {});
    }
  }

  // Persist: update the existing SOP doc in place when re-synthesizing,
  // otherwise create a new one.
  const document = {
    ...sop,
    ...(sopVector ? { vector: sopVector } : {}),
    created_at: args.createdAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_sessions: session_ids,
  };

  let sopId: string;
  if (args.existingSopId) {
    await esClient.index({
      index: sopsIndex,
      id: args.existingSopId,
      document,
      refresh: 'wait_for',
    });
    sopId = args.existingSopId;
  } else {
    const sopResult = await esClient.index({
      index: sopsIndex,
      document,
      refresh: 'wait_for',
    });
    sopId = sopResult._id!;
  }

  // Mark sessions as synthesized
  for (const sid of session_ids) {
    await esClient
      .update({
        index: SESSIONS_INDEX,
        id: sid,
        doc: { status: 'synthesized' },
      })
      .catch(() => {});
  }

  logger.info(
    `SOP ${args.existingSopId ? 're-synthesized' : 'synthesized'}: "${name}" from ${
      session_ids.length
    } sessions`
  );

  return { ...sop, id: sopId };
}

export function registerSynthesizeRoutes(router: IRouter, logger: Logger, deps: RouteDeps) {
  // Synthesize SOP from one or more sessions
  router.post(
    {
      path: `${API_BASE}/synthesize`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      // Synthesis does up to TWO LLM round-trips (vision/agent + workflow
      // authoring); raise the idle socket timeout well past the 120s default so
      // long runs don't get cut off (mirrors the agent_builder chat route).
      options: { timeout: { idleSocket: 15 * 60 * 1000 } },
      validate: {
        body: schema.object({
          session_ids: schema.arrayOf(schema.string(), { minSize: 1 }),
          name: schema.string(),
          description: schema.maybe(schema.string()),
          connector_id: schema.string(), // LLM connector ID for inference
        }),
      },
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;
        const { session_ids, name, description, connector_id } = request.body;

        const sop = await runSynthesis({
          esClient,
          request,
          deps,
          logger,
          session_ids,
          name,
          description,
          connector_id,
        });

        return response.ok({ body: { sop } });
      } catch (error: any) {
        logger.error(`Synthesis failed: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );

  // List synthesized SOPs
  router.get(
    {
      path: `${API_BASE}/sops`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {},
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        const body = await esClient.search({
          index: `${SESSIONS_INDEX}-sops`,
          size: 50,
          sort: [{ created_at: { order: 'desc' } }],
          query: { match_all: {} },
        });

        const sops = body.hits.hits.map((hit) => ({
          ...(hit._source as Record<string, unknown>),
          id: hit._id,
        }));
        return response.ok({ body: { sops } });
      } catch (error: any) {
        if (error?.meta?.statusCode === 404) {
          return response.ok({ body: { sops: [] } });
        }
        return response.customError({ statusCode: 500, body: { message: error.message } });
      }
    }
  );
}
