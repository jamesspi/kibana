/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PLUGIN_ID = 'sopLearning';
export const PLUGIN_NAME = 'Protégé';

export const API_BASE = '/api/sop_learning';

export const ANNOTATIONS_INDEX = 'sop-learning-annotations';
export const SESSIONS_INDEX = 'sop-learning-sessions';
export const AUDIT_INDEX = '.kibana-audit-*';

/**
 * Suggested SOP/workflow types offered as presets in the recording setup.
 * `workflow_type` is a free-form string end-to-end, so analysts can also type
 * a custom type; these are just sensible starting points.
 */
export const SOP_TYPE_PRESETS = [
  'alert_triage',
  'threat_hunt',
  'incident_response',
  'case_management',
] as const;

/** Aggregated metrics powering the Overview dashboard. */
export interface OverviewMetrics {
  sessions: {
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    by_analyst: Record<string, number>;
  };
  events: {
    total: number;
    by_category: Record<string, number>;
    voice_segments: number;
    typed_narrations: number;
    esql_queries: number;
  };
  sops: {
    total: number;
    avg_confidence: number;
    by_generated_via: Record<string, number>;
    by_workflow_via: Record<string, number>;
    distinct_tools: number;
  };
  media: {
    video_count: number;
    audio_count: number;
    frame_count: number;
    total_bytes: number;
  };
  deployments: {
    total: number;
    by_type: Record<string, number>;
  };
  embedded_sessions: number;
  /** Activity over time: ISO date -> count of sessions started that day. */
  activity: Array<{ date: string; sessions: number; sops: number }>;
}


export interface RecordingSession {
  id: string;
  analyst_id: string;
  analyst_name: string;
  started_at: string;
  ended_at?: string;
  workflow_type: string;
  workflow_label: string;
  status: 'recording' | 'completed' | 'synthesized';
  event_count: number;
}

export interface RecordedEvent {
  '@timestamp': string;
  session_id: string;
  event_type: string;
  category: string;
  description: string;
  details: Record<string, unknown>;
  narration?: string;
  /**
   * For voice-transcript events only: offset (ms from recording start) of the
   * spoken segment this transcript came from. Produced client-side by the
   * browser Web Speech API during recording. Lets the UI cite "voice 5s–20s".
   */
  audio_start_ms?: number;
  audio_end_ms?: number;
}

/**
 * A single source the LLM cited as the basis for a synthesized step. The
 * model is instructed to emit these; we only ever render labels that map back
 * to evidence that genuinely existed in the input.
 *  - `ui_action`     -> a captured click / query / navigation event
 *  - `voice`         -> a browser-transcribed spoken segment (timestamped)
 *  - `typed`         -> typed narration the analyst entered
 *  - `frame`         -> a screen keyframe (image) actually sent to Claude vision
 */
export interface ProvenanceRef {
  type: 'ui_action' | 'voice' | 'typed' | 'frame';
  /** Stable id of the source event/segment (matches the [id] shown in prompt). */
  ref?: string;
  /** Human label, e.g. "alert.clicked @11:30:04", "voice 5s–20s", "screen frame @0:45". */
  label?: string;
}

/**
 * Lightweight record of what evidence the synthesis was derived from, so the UI
 * can show e.g. "synthesized from 42 actions + 12 voice segments + 3 typed
 * narrations + 10 screen frames across 3 sessions".
 *
 * NOTE: `screen_video_present` records only that a screen .webm was recorded.
 * The raw video itself is NOT sent to Claude. Instead, `screen_frame_count`
 * periodic keyframes were extracted from the screen and sent to Claude's vision
 * (image content parts) — those genuinely contribute to step content/provenance.
 */
export interface SOPProvenance {
  session_count: number;
  action_event_count: number;
  /** Browser-transcribed spoken segments fed to the LLM. */
  voice_segment_count: number;
  /** Typed narration entries fed to the LLM. */
  narration_count: number;
  /** True if any session has a screen recording stored. */
  screen_video_present: boolean;
  /** Number of screen keyframes actually sent to Claude as image content. */
  screen_frame_count?: number;
}

export interface SynthesizedSOP {
  id: string;
  name: string;
  description: string;
  steps: SOPStep[];
  confidence: number;
  session_ids: string[];
  /** Distinct Agent Builder tool_ids referenced across all steps. */
  tool_ids?: string[];
  provenance?: SOPProvenance;
  skill_output?: string;
  workflow_output?: string;
  /** The model's `trigger_conditions` (when this SOP should activate), if any. */
  trigger_conditions?: string;
  /** The model's decision/branch points, if any. */
  decision_points?: Array<{
    after_step?: number;
    condition?: string;
    escalate_to_step?: number;
    otherwise?: string;
  }>;
  /**
   * How the Elastic Workflow YAML (`workflow_output`) was authored:
   *  - `agent_builder_nl` — produced by the real Agent Builder / Workflows
   *     natural-language workflow authoring capability (`generateWorkflow` from
   *     `@kbn/agent-builder-workflow-gen`, the engine behind the
   *     `platform.core.generate_workflow` tool / "workflow-authoring" skill).
   *     The YAML is schema-validated by Workflows Management before being
   *     returned.
   *  - `fallback` — the local hand-rolled YAML string-builder, used only when
   *     the NL capability is unavailable (plugin disabled / deps missing) or its
   *     call failed.
   */
  workflow_generated_via?: 'agent_builder_nl' | 'fallback';
  /** Short human-readable note explaining why the fallback path was used. */
  workflow_generation_note?: string;
  /**
   * How the step plan was produced, so the UI can be honest about the engine:
   *  - `claude_multimodal` — direct vision LLM call: the model SAW the screen
   *     keyframes (image content parts) alongside the events/transcript. Tool
   *     selection is grounded against the real Agent Builder tool catalog.
   *  - `agent_builder` — Elastic Agent Builder agent (tool-grounded, text-only
   *     reasoning). Used when there are no frames to see.
   *  - `llm`           — direct text-only LLM call (no frames, AB unavailable).
   */
  generated_via?: 'claude_multimodal' | 'agent_builder' | 'llm';
}

/**
 * An existing SOP surfaced by the kNN "similar SOP" check, enriched with enough
 * detail for the UI to (a) EXPLAIN why it matched and (b) LINK/preview it so the
 * analyst can inspect it before deciding to synthesize a duplicate.
 */
export interface SimilarSOP {
  id: string;
  name?: string;
  description?: string;
  confidence?: number;
  /** Raw kNN similarity score from the SOPs index. */
  score?: number;
  /** Distinct Agent Builder tool_ids the matched SOP uses. */
  tool_ids?: string[];
  /** The matched SOP's steps (id/order/name/description/tool_id) for preview. */
  steps?: SOPStep[];
  /** Session ids the matched SOP was synthesized from. */
  source_sessions?: string[];
  created_at?: string;
  /**
   * Human-readable reasons the match is considered similar, computed by the
   * server (e.g. "shares tool security.alerts", "1 overlapping source session",
   * "high vector similarity"). Rendered as bullet points in the callout.
   */
  match_reasons?: string[];
}

/**
 * A SOC WRITE action that no built-in Agent Builder tool can actually perform.
 * The six known gaps (create/update case, change alert status, assign alert,
 * add alert note, isolate/release host, other endpoint response actions) have
 * NO true built-in tool — mapping them onto `platform.core.cases` (read-only)
 * or `platform.core.execute_connector_sub_action` (external SOAR/ITSM only)
 * would emit a tool call that cannot perform the action. Instead, the step is
 * flagged with a `capability_gap` so the UI can PROPOSE a gap-filling
 * workflow-tool instead of pretending a real tool exists.
 */
export interface CapabilityGap {
  /** The write action the step needs (e.g. "create_case", "isolate_host"). */
  action: string;
  /** Why no built-in tool can do this (analyst-readable). */
  reason: string;
  /**
   * How the gap can realistically be filled:
   *  - `workflow_tool`        — a saved Elastic Workflow (with a REAL step type,
   *     e.g. `cases.createCase`) registered as an Agent Builder workflow tool.
   *  - `connector_sub_action` — an external SOAR/ITSM/case-push connector
   *     (ServiceNow / TheHive / .cases-webhook) via
   *     `platform.core.execute_connector_sub_action`.
   *  - `custom_connector`     — no native workflow step OR built-in tool exists
   *     (e.g. endpoint host isolation); needs a custom connector / HTTP call to
   *     the Endpoint Management API. Surfaced honestly, never faked.
   */
  suggested_fill: 'workflow_tool' | 'connector_sub_action' | 'custom_connector';
}

export interface SOPStep {
  id: string;
  order: number;
  name: string;
  description: string;
  action_type: 'query' | 'enrichment' | 'decision' | 'response_action' | 'case_action' | 'manual';
  /**
   * The concrete Agent Builder tool the agent should invoke for this step
   * (e.g. "platform.core.execute_esql", "security.alerts", "security.get_entity").
   * Empty for pure reasoning/decision steps with no tool equivalent.
   */
  tool_id?: string;
  /** Human-readable parameters for the tool call (e.g. the entity to analyze). */
  tool_params?: string;
  query_template?: string;
  intent?: string;
  confidence: number;
  is_optional: boolean;
  /**
   * Set when this step needs a WRITE capability that no built-in Agent Builder
   * tool can perform. When present, `tool_id` is intentionally left empty (we
   * do NOT emit a bogus read-only tool) until a gap-filling workflow tool is
   * created and assigned.
   */
  capability_gap?: CapabilityGap;
  /**
   * Which captured source(s) this step was derived from. Emitted by the LLM
   * and validated against the evidence ids we put in the prompt. Rendered as
   * small footnote badges under each step.
   */
  provenance?: ProvenanceRef[];
}

/**
 * A proposed gap-filling artifact for one capability-gap step: a Workflow YAML
 * that performs the gap action using REAL workflow step types, plus the tool id
 * it would be registered under once created. Generated NON-DESTRUCTIVELY (shown
 * before any creation) by `POST /sops/{id}/gap-fills`. The user creates it with
 * one click via `POST /sops/{id}/gap-fills/create`.
 */
export interface WorkflowToolProposal {
  /** The SOP step id this proposal fills. */
  step_id: string;
  /** The gap action being filled (mirrors CapabilityGap.action). */
  action: string;
  /** Proposed Workflow id (human-readable, used for both workflow + tool id). */
  workflow_id: string;
  /** Proposed Agent Builder workflow-tool id once registered. */
  tool_id: string;
  /** Short title for the proposal card. */
  title: string;
  /** Analyst-readable description of what the workflow does. */
  description: string;
  /**
   * The proposed Workflow YAML. Always populated now that every supported SOC
   * write action has a real Kibana API to call (via a first-class `kibana.*`
   * connector step or a generic `http` step to the documented endpoint).
   */
  yaml: string;
  /**
   * The real Kibana API this workflow calls (e.g.
   * "POST /api/endpoint/action/isolate"), so the proposal text is accurate.
   */
  api?: string;
  /**
   * The workflow mechanism used:
   *  - `kibana_connector_step` — a first-class generated `kibana.*` workflow
   *     step (e.g. kibana.createCase, kibana.SetAlertsStatus).
   *  - `http_step`             — a generic `http` step calling the documented
   *     Kibana API path (used for APIs without a generated connector step:
   *     endpoint isolate/unisolate, alert assignees, alert notes).
   */
  mechanism?: 'kibana_connector_step' | 'http_step';
  /**
   * True when a real workflow can perform the action. Now that the documented
   * Kibana APIs are used, all SUPPORTED actions are feasible. `false` is
   * reserved for any action with genuinely no API.
   */
  feasible: boolean;
  /** Why feasible/infeasible (which real step type/API, or what's missing). */
  note: string;
}
