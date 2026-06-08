/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SynthesizedSOP, WorkflowToolProposal } from '../../common';

/**
 * Generate gap-filling WORKFLOW-TOOL proposals for a synthesized SOP.
 *
 * For each step flagged with a `capability_gap` (a SOC write action no built-in
 * Agent Builder tool can perform), this proposes a saved Elastic Workflow that
 * actually performs the action by calling the REAL, DOCUMENTED Kibana API —
 * which can then be registered as an Agent Builder `workflow` tool so the SOP
 * can reference it.
 *
 * Every supported SOC write action has a real Kibana API, so NONE of these are
 * "impossible" anymore. We use the most accurate real mechanism:
 *
 *  FIRST-CLASS `kibana.*` workflow connector steps (auto-generated from the
 *  Kibana OpenAPI spec — verified in
 *  `src/platform/packages/shared/kbn-workflows/spec/kibana/generated/`):
 *    - `kibana.createCase`      → POST /api/cases
 *    - `kibana.addCaseComment`  → POST /api/cases/{caseId}/comments
 *    - `kibana.SetAlertsStatus` → POST /api/detection_engine/signals/status
 *
 *  Generic `http` step to the documented Kibana API (for endpoints WITHOUT a
 *  generated connector step — verified against the security_solution routes):
 *    - host isolate   → POST /api/endpoint/action/isolate
 *    - host release    → POST /api/endpoint/action/unisolate
 *    - endpoint action → POST /api/endpoint/action/{kill_process|...}
 *    - assign alert    → POST /api/detection_engine/signals/assignees
 *    - add alert note  → PATCH /api/note
 *
 * Workflows are parameterized generically with {{ inputs.alert.* }} placeholders
 * (host/agent id, alert uuid, etc.). Proposals are NON-DESTRUCTIVE: nothing is
 * created here; the caller shows them and only creates on explicit user action.
 */
export function buildGapFillProposals(sop: SynthesizedSOP): WorkflowToolProposal[] {
  const slug =
    (sop.name || 'sop')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sop';

  const proposals: WorkflowToolProposal[] = [];
  let n = 0;
  for (const step of sop.steps ?? []) {
    const gap = step.capability_gap;
    if (!gap) continue;
    n += 1;
    const workflowId = `${slug}-gap-${gap.action.replace(/_/g, '-')}-${n}`;
    const toolId = `sop.${slug.replace(/-/g, '_')}_${gap.action}`;
    proposals.push(buildProposal(step.id, gap.action, gap.reason, workflowId, toolId));
  }
  return proposals;
}

function header(workflowId: string, description: string): string {
  return [
    `name: ${workflowId}`,
    'enabled: true',
    `description: "${description.replace(/"/g, '\\"')}"`,
    'triggers:',
    '  - type: alert',
    '    with:',
    '      severity: ["high", "critical"]',
    '',
    'inputs:',
    '  - name: alert',
    '    type: object',
    '    required: true',
    '',
    'steps:',
  ].join('\n');
}

interface BuiltGap {
  title: string;
  description: string;
  api: string;
  mechanism: 'kibana_connector_step' | 'http_step';
  steps: string[];
  note: string;
}

function buildProposal(
  stepId: string,
  action: string,
  reason: string,
  workflowId: string,
  toolId: string
): WorkflowToolProposal {
  const b = buildGapBody(action, reason);
  return {
    step_id: stepId,
    action,
    workflow_id: workflowId,
    tool_id: toolId,
    title: b.title,
    description: b.description,
    api: b.api,
    mechanism: b.mechanism,
    yaml: header(workflowId, b.description) + '\n' + b.steps.join('\n'),
    feasible: true,
    note: b.note,
  };
}

/**
 * The inner workflow step YAML lines that perform a capability-gap action via
 * the real Kibana API. Shared by the standalone gap-fill workflow generator
 * (`buildGapFillProposals`) and the inline workflow-YAML builder
 * (`generateWorkflowYaml`) so both emit the SAME accurate, real step types.
 * Returns the indented `- name: …` step block lines.
 */
export function gapActionStepLines(action: string, stepName: string): string[] {
  const b = buildGapBody(action, '');
  // The first body line is `  - name: <fixed>`; replace it with the caller's id.
  const rest = b.steps.slice(1);
  return [`  - name: ${stepName}`, ...rest];
}

function buildGapBody(action: string, reason: string): BuiltGap {
  switch (action) {
    case 'create_case':
      return {
        title: 'Create a security case for the alert',
        description: 'Creates a security case from the triggering alert via the Cases API.',
        api: 'POST /api/cases',
        mechanism: 'kibana_connector_step',
        steps: [
          '  - name: create_case',
          '    type: kibana.createCase',
          '    with:',
          '      title: "{{ inputs.alert.kibana.alert.rule.name }} - {{ inputs.alert.host.name }}"',
          '      description: "Auto-created by SOP for alert {{ inputs.alert._id }}"',
          '      owner: "securitySolution"',
          '      severity: "high"',
          '      tags: ["sop-learning", "automated"]',
          '      connector:',
          '        id: "none"',
          '        name: "none"',
          '        type: ".none"',
          '        fields: null',
          '      settings:',
          '        syncAlerts: true',
        ],
        note: 'Uses the first-class kibana.createCase workflow connector step (POST /api/cases) — verified in kbn-workflows generated Kibana connectors.',
      };
    case 'update_case':
      return {
        title: "Attach a comment to the alert's case",
        description: 'Adds a comment to an existing case via the Cases comments API.',
        api: 'POST /api/cases/{caseId}/comments',
        mechanism: 'kibana_connector_step',
        steps: [
          '  - name: add_case_comment',
          '    type: kibana.addCaseComment',
          '    with:',
          '      caseId: "{{ inputs.case_id }}"',
          '      type: "user"',
          '      owner: "securitySolution"',
          '      comment: "SOP update for alert {{ inputs.alert._id }}"',
        ],
        note: 'Uses the first-class kibana.addCaseComment workflow connector step (POST /api/cases/{caseId}/comments). Provide the target case id as an input (e.g. from a prior find-case step).',
      };
    case 'set_alert_status':
      return {
        title: 'Set the alert status (acknowledge / close)',
        description: 'Sets the detection alert status via the alerts status API.',
        api: 'POST /api/detection_engine/signals/status',
        mechanism: 'kibana_connector_step',
        steps: [
          '  - name: set_alert_status',
          '    type: kibana.SetAlertsStatus',
          '    with:',
          '      signal_ids: ["{{ inputs.alert._id }}"]',
          '      status: "acknowledged"',
        ],
        note: 'Uses the first-class kibana.SetAlertsStatus workflow connector step (POST /api/detection_engine/signals/status). status may be open | acknowledged | closed.',
      };
    case 'assign_alert':
      return {
        title: 'Assign the alert to an analyst',
        description:
          'Assigns the alert to one or more analysts via the alert assignees API.',
        api: 'POST /api/detection_engine/signals/assignees',
        mechanism: 'http_step',
        steps: [
          '  - name: assign_alert',
          '    type: http',
          '    with:',
          '      url: "/api/detection_engine/signals/assignees"',
          '      method: POST',
          '      headers:',
          '        kbn-xsrf: "true"',
          '        Content-Type: application/json',
          '      body:',
          '        assignees:',
          '          add: ["{{ inputs.assignee_uid }}"]',
          '          remove: []',
          '        ids: ["{{ inputs.alert._id }}"]',
        ],
        note: 'No generated kibana.* connector exists for assignees, so this uses a generic http step to the documented API (POST /api/detection_engine/signals/assignees). assignees.add takes user profile uids. The http step must target Kibana (configure its connector/base URL accordingly).',
      };
    case 'add_alert_note':
      return {
        title: 'Add a note to the alert',
        description: 'Adds a note associated with the alert via the notes API.',
        api: 'PATCH /api/note',
        mechanism: 'http_step',
        steps: [
          '  - name: add_alert_note',
          '    type: http',
          '    with:',
          '      url: "/api/note"',
          '      method: PATCH',
          '      headers:',
          '        kbn-xsrf: "true"',
          '        Content-Type: application/json',
          '      body:',
          '        note:',
          '          eventId: "{{ inputs.alert._id }}"',
          '          note: "SOP note for alert {{ inputs.alert._id }}"',
        ],
        note: 'No generated kibana.* connector exists for notes, so this uses a generic http step to the documented API (PATCH /api/note — note the PATCH verb). The http step must target Kibana (configure its connector/base URL accordingly).',
      };
    case 'isolate_host':
      return {
        title: 'Isolate the affected host',
        description: 'Isolates the endpoint via the Endpoint Management response-actions API.',
        api: 'POST /api/endpoint/action/isolate',
        mechanism: 'http_step',
        steps: [
          '  - name: isolate_host',
          '    type: http',
          '    with:',
          '      url: "/api/endpoint/action/isolate"',
          '      method: POST',
          '      headers:',
          '        kbn-xsrf: "true"',
          '        Content-Type: application/json',
          '      body:',
          '        endpoint_ids: ["{{ inputs.alert.agent.id }}"]',
          '        alert_ids: ["{{ inputs.alert._id }}"]',
          '        comment: "Isolated by SOP for alert {{ inputs.alert._id }}"',
        ],
        note: 'There IS a real Endpoint Management API for host isolation (POST /api/endpoint/action/isolate). No generated kibana.* connector step exists for it, so this uses a generic http step to that documented API. endpoint_ids are agent ids (alert.agent.id). The http step must target Kibana (configure its connector/base URL accordingly).',
      };
    case 'release_host':
      return {
        title: 'Release the isolated host',
        description:
          'Releases an isolated endpoint via the Endpoint Management response-actions API.',
        api: 'POST /api/endpoint/action/unisolate',
        mechanism: 'http_step',
        steps: [
          '  - name: release_host',
          '    type: http',
          '    with:',
          '      url: "/api/endpoint/action/unisolate"',
          '      method: POST',
          '      headers:',
          '        kbn-xsrf: "true"',
          '        Content-Type: application/json',
          '      body:',
          '        endpoint_ids: ["{{ inputs.alert.agent.id }}"]',
          '        alert_ids: ["{{ inputs.alert._id }}"]',
          '        comment: "Released by SOP for alert {{ inputs.alert._id }}"',
        ],
        note: 'There IS a real Endpoint Management API to release a host (POST /api/endpoint/action/unisolate). Uses a generic http step to that documented API. endpoint_ids are agent ids (alert.agent.id).',
      };
    case 'endpoint_response_action':
    default:
      return {
        title: 'Run an endpoint response action',
        description:
          'Runs an endpoint response action (kill-process, get-file, etc.) via the Endpoint Management response-actions API.',
        api: 'POST /api/endpoint/action/{kill_process|suspend_process|running_procs|get_file|...}',
        mechanism: 'http_step',
        steps: [
          '  - name: endpoint_response_action',
          '    type: http',
          '    with:',
          '      # Choose the documented response-action route, e.g. kill_process, get_file, scan, execute.',
          '      url: "/api/endpoint/action/kill_process"',
          '      method: POST',
          '      headers:',
          '        kbn-xsrf: "true"',
          '        Content-Type: application/json',
          '      body:',
          '        endpoint_ids: ["{{ inputs.alert.agent.id }}"]',
          '        alert_ids: ["{{ inputs.alert._id }}"]',
          '        comment: "Response action by SOP for alert {{ inputs.alert._id }}"',
          '        parameters: {}',
        ],
        note: 'There ARE real Endpoint Management response-action APIs (POST /api/endpoint/action/{kill_process|suspend_process|get_file|scan|execute|run_script|...}). Uses a generic http step to the chosen documented route. Set the route + parameters for the specific action. endpoint_ids are agent ids.',
      };
  }
}
