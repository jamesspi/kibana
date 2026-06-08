/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, KibanaRequest } from '@kbn/core/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { WorkflowsManagementApi } from '@kbn/workflows-management-plugin/server';
import { generateWorkflow } from '@kbn/agent-builder-workflow-gen';
import { stringifyWorkflowDefinition } from '@kbn/workflows-yaml';
import type { SynthesizedSOP, SOPStep } from '../../common';
import { generateWorkflowYaml } from './synthesis';

export type WorkflowAuthoredVia = NonNullable<SynthesizedSOP['workflow_generated_via']>;

export interface WorkflowAuthoringResult {
  yaml: string;
  via: WorkflowAuthoredVia;
  /** Set when the fallback path was taken; explains why. */
  note?: string;
}

/**
 * Render the synthesized SOP as a NATURAL-LANGUAGE workflow description suitable
 * for the Agent Builder / Workflows NL workflow-authoring capability.
 *
 * The workflow-generation agent already has innate knowledge of the workflow
 * syntax, the available step/trigger types, and the configured connectors (see
 * the system prompt in `@kbn/agent-builder-workflow-gen`). So we do NOT emit
 * YAML or step types here — we describe, in plain language, the trigger, the
 * ordered sequence of agent-tool steps (with their intent), and any concrete
 * ES|QL the analyst actually ran, and let the capability translate that into
 * schema-valid Elastic Workflow YAML.
 */
export function buildWorkflowNlDescription(
  sop: SynthesizedSOP,
  parsed?: { trigger_conditions?: string; decision_points?: any[] }
): string {
  const lines: string[] = [];

  lines.push(
    `Create an Elastic Workflow that automates the security operations procedure "${sop.name}".`
  );
  if (sop.description) {
    lines.push('');
    lines.push(`Purpose: ${sop.description}`);
  }

  const trigger = parsed?.trigger_conditions?.trim();
  lines.push('');
  if (trigger) {
    lines.push(
      `Trigger: the workflow should run when ${trigger}. If this maps cleanly to a security alert, use an alert trigger; otherwise use a scheduled or manual trigger as appropriate.`
    );
  } else {
    lines.push(
      'Trigger: run the workflow when a relevant high/critical security alert fires (use an alert trigger if available, otherwise a manual trigger).'
    );
  }

  lines.push('');
  lines.push(
    'Steps (perform in order; each corresponds to an investigative/response action an Elastic AI agent would take):'
  );

  const stepLines = sop.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step, i) => describeStep(step, i + 1));
  lines.push(stepLines.join('\n'));

  if (parsed?.decision_points?.length) {
    lines.push('');
    lines.push('Decision/branching logic:');
    for (const dp of parsed.decision_points) {
      const after = dp?.after_step;
      const cond = dp?.condition;
      const to = dp?.escalate_to_step;
      const otherwise = dp?.otherwise;
      if (cond) {
        lines.push(
          `- After step ${after ?? '?'}: if ${cond}, branch to step ${to ?? '?'}` +
            (otherwise ? ` (otherwise: ${otherwise}).` : '.')
        );
      }
    }
  }

  lines.push('');
  lines.push(
    'Where a step has a concrete ES|QL query, use the "elasticsearch.esql.query" step and reuse that query verbatim (keep any {{ ... }} placeholders as Liquid templating). For creating/commenting on a case, use the first-class "kibana.createCase"/"kibana.addCaseComment" workflow connector steps. For changing alert status, use "kibana.SetAlertsStatus" (POST /api/detection_engine/signals/status). For host isolation/response actions, alert assignment, or alert notes (which have no generated connector step), use a generic "http" step that calls the documented Kibana API — e.g. POST /api/endpoint/action/isolate for host isolation, POST /api/detection_engine/signals/assignees for assignment, PATCH /api/note for notes. Do NOT invent step types like "endpoint.response_action". Keep the workflow structurally complete and valid.'
  );

  return lines.join('\n');
}

function describeStep(step: SOPStep, n: number): string {
  const parts: string[] = [`${n}. ${step.name}${step.is_optional ? ' (optional)' : ''}:`];
  parts.push(step.description || '');
  const meta: string[] = [];
  if (step.tool_id) meta.push(`maps to the Elastic agent tool "${step.tool_id}"`);
  if (step.action_type) meta.push(`action type: ${step.action_type}`);
  if (step.tool_params) meta.push(`parameters: ${step.tool_params}`);
  if (step.intent) meta.push(`intent: ${step.intent}`);
  if (step.capability_gap) {
    // Tell the NL generator the real mechanism + Kibana API so it emits an
    // accurate step (kibana.* connector step, or http to the documented API).
    const g = step.capability_gap;
    if (g.action === 'create_case') {
      meta.push('use the first-class "kibana.createCase" step (POST /api/cases)');
    } else if (g.action === 'update_case') {
      meta.push('use the first-class "kibana.addCaseComment" step (POST /api/cases/{caseId}/comments)');
    } else if (g.action === 'set_alert_status') {
      meta.push(
        'use the first-class "kibana.SetAlertsStatus" step (POST /api/detection_engine/signals/status)'
      );
    } else if (g.action === 'isolate_host') {
      meta.push('use an http step calling POST /api/endpoint/action/isolate (endpoint_ids = alert.agent.id)');
    } else if (g.action === 'release_host') {
      meta.push('use an http step calling POST /api/endpoint/action/unisolate');
    } else if (g.action === 'assign_alert') {
      meta.push('use an http step calling POST /api/detection_engine/signals/assignees');
    } else if (g.action === 'add_alert_note') {
      meta.push('use an http step calling PATCH /api/note');
    } else {
      meta.push(
        'use an http step calling the documented Endpoint Management response-action API (POST /api/endpoint/action/{kill_process|get_file|scan|execute|...})'
      );
    }
  }
  let line = `   - ${parts.join(' ').trim()}`;
  if (meta.length) line += `\n     (${meta.join('; ')})`;
  if (step.query_template && step.query_template.trim()) {
    line += `\n     ES|QL to use (run via the "elasticsearch.esql.query" step):\n     ${step.query_template
      .trim()
      .replace(/\n/g, '\n     ')}`;
  }
  return line;
}

/**
 * Author the Elastic Workflow YAML for a synthesized SOP using the REAL Agent
 * Builder / Workflows natural-language workflow-authoring capability.
 *
 * This calls `generateWorkflow` from `@kbn/agent-builder-workflow-gen` — the
 * exact engine that backs the Agent Builder `platform.core.generate_workflow`
 * tool and the "workflow-authoring" skill. It runs a workflow-generation agent
 * that emits YAML and self-validates it against the Workflows Management schema
 * (`api.validateWorkflow`), retrying on validation errors, so the returned YAML
 * is guaranteed schema-valid.
 *
 * Falls back to the local hand-rolled YAML string-builder ONLY when the
 * capability is unavailable (Agent Builder or Workflows Management disabled) or
 * its call throws. The caller is told which path was taken via the result's
 * `via`/`note` so the UI can surface it honestly.
 */
export async function authorWorkflowYaml({
  sop,
  parsed,
  request,
  connectorId,
  spaceId,
  agentBuilder,
  workflowsApi,
  logger,
}: {
  sop: SynthesizedSOP;
  parsed?: { trigger_conditions?: string; decision_points?: any[] };
  request: KibanaRequest;
  connectorId: string;
  spaceId: string;
  agentBuilder?: AgentBuilderPluginStart;
  workflowsApi?: WorkflowsManagementApi;
  logger: Logger;
}): Promise<WorkflowAuthoringResult> {
  const fallback = (note: string): WorkflowAuthoringResult => {
    logger.info(
      `Elastic Workflow authored via LOCAL FALLBACK (workflow_generated_via=fallback): ${note}`
    );
    return { yaml: generateWorkflowYaml(sop.steps, parsed), via: 'fallback', note };
  };

  if (!agentBuilder) {
    return fallback('Agent Builder plugin is not available.');
  }
  if (!workflowsApi) {
    return fallback('Workflows Management plugin is not available.');
  }

  const nlDescription = buildWorkflowNlDescription(sop, parsed);

  try {
    const modelProvider = agentBuilder.runtime.createModelProvider({
      request,
      defaultConnectorId: connectorId || undefined,
    });
    const model = connectorId
      ? await modelProvider.getModelById({ connectorId })
      : await modelProvider.getDefaultModel();

    logger.info(
      `Elastic Workflow authoring: calling Agent Builder NL workflow-authoring capability ` +
        `(generateWorkflow) for SOP "${sop.name}" — ${sop.steps.length} step(s), ` +
        `nl_chars=${nlDescription.length}, connector="${connectorId || 'default'}".`
    );
    logger.debug(`Workflow NL description for "${sop.name}":\n${nlDescription}`);

    const { workflow, response: generationComment } = await generateWorkflow({
      nlQuery: nlDescription,
      model,
      logger,
      request,
      spaceId,
      workflowsApi,
    });

    const yaml = stringifyWorkflowDefinition(workflow);
    logger.info(
      `Elastic Workflow authored via Agent Builder NL authoring ` +
        `(workflow_generated_via=agent_builder_nl) for SOP "${sop.name}": ` +
        `schema-validated, ${yaml.length} chars.` +
        (generationComment ? ` Agent note: ${generationComment.slice(0, 200)}` : '')
    );
    return { yaml, via: 'agent_builder_nl' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fallback(`NL workflow-authoring capability call failed: ${message}`);
  }
}
