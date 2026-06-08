import { SynthesizedSOP, SOPStep, SOPProvenance, ProvenanceRef, CapabilityGap } from '../../common';
import { gapActionStepLines } from './gap_fills';

/**
 * Catalog of Elastic Agent Builder tools the synthesized SOP may map onto.
 *
 * Tool IDs are sourced directly from Kibana:
 *  - platform.core.* — built-in agentBuilder tools, defined in
 *    `x-pack/platform/packages/shared/agent-builder/agent-builder-common/tools/constants.ts`
 *    (`platformCoreTools`).
 *  - security.*      — security solution agentBuilder tools, defined in
 *    `x-pack/solutions/security/plugins/security_solution/server/agent_builder/tools/*`
 *    (namespaced via `securityTool()` → `security.<name>`).
 *
 * These are the capabilities an AI agent / Elastic Workflow actually has. The
 * LLM must translate observed human UI actions into invocations of these tools.
 */
export interface AgentToolDef {
  tool_id: string;
  category: string;
  summary: string;
  /** action_type the SOP step should use when this tool is selected. */
  action_type: SOPStep['action_type'];
  /**
   * The REAL read/write capability of this tool. The synthesis prompt is told
   * this verbatim so the model stops claiming a read-only tool can write:
   *  - `read`  — search/get/analyze only (NO mutations). e.g. security.alerts,
   *     platform.core.cases (cannot create/update a case), entity tools.
   *  - `write` — actually mutates state via this tool's own mechanism.
   */
  capability: 'read' | 'write';
}

/**
 * The SOC WRITE actions that have NO true built-in Agent Builder tool. Each is
 * a capability GAP: the synthesis must NOT map it onto a read-only tool. The
 * `suggested_fill` says how the gap can realistically be filled (a workflow
 * tool using a real step type, an external SOAR/ITSM connector sub-action, or
 * — when no native mechanism exists — a custom connector). Keyed by a stable
 * action id the model is told to emit in `capability_gap.action`.
 */
export const CAPABILITY_GAPS: Record<string, Omit<CapabilityGap, 'action'>> = {
  create_case: {
    reason:
      'No built-in Agent Builder tool can create a case (platform.core.cases is READ-ONLY: search/get). Fillable by a workflow tool using the real kibana.createCase step (POST /api/cases).',
    suggested_fill: 'workflow_tool',
  },
  update_case: {
    reason:
      'platform.core.cases is READ-ONLY and cannot update/attach to a case. Fillable by a workflow tool using the real kibana.addCaseComment step (POST /api/cases/{caseId}/comments).',
    suggested_fill: 'workflow_tool',
  },
  set_alert_status: {
    reason:
      'security.alerts is SEARCH/ANALYSIS ONLY — it cannot acknowledge/close or otherwise change alert status. Fillable by a workflow tool using the real kibana.SetAlertsStatus step (POST /api/detection_engine/signals/status).',
    suggested_fill: 'workflow_tool',
  },
  assign_alert: {
    reason:
      'No built-in tool can assign an alert (security.alerts is read-only). Fillable by a workflow tool that calls the real alert-assignees API (POST /api/detection_engine/signals/assignees) via an http step.',
    suggested_fill: 'workflow_tool',
  },
  add_alert_note: {
    reason:
      'No built-in tool can add a note to an alert. Fillable by a workflow tool that calls the real notes API (PATCH /api/note) via an http step.',
    suggested_fill: 'workflow_tool',
  },
  isolate_host: {
    reason:
      'No built-in tool isolates a host (execute_connector_sub_action only drives external SOAR/ITSM connectors). BUT there IS a real Endpoint Management API — fillable by a workflow tool that calls POST /api/endpoint/action/isolate via an http step.',
    suggested_fill: 'workflow_tool',
  },
  release_host: {
    reason:
      'No built-in tool releases an isolated host, but there IS a real Endpoint Management API — fillable by a workflow tool that calls POST /api/endpoint/action/unisolate via an http step.',
    suggested_fill: 'workflow_tool',
  },
  endpoint_response_action: {
    reason:
      'No built-in tool runs endpoint response actions, but there ARE real Endpoint Management APIs (POST /api/endpoint/action/{kill_process|get_file|scan|execute|...}) — fillable by a workflow tool that calls the chosen route via an http step.',
    suggested_fill: 'workflow_tool',
  },
};

export const AGENT_TOOL_CATALOG: AgentToolDef[] = [
  {
    tool_id: 'platform.core.generate_esql',
    category: 'ES|QL query generation',
    summary:
      'Generate an ES|QL query from a natural-language request. Use to express what data to retrieve (e.g. "critical alerts in the last 90 days").',
    action_type: 'query',
    capability: 'read',
  },
  {
    tool_id: 'platform.core.execute_esql',
    category: 'ES|QL query execution',
    summary:
      'Execute an ES|QL query and return rows (READ-ONLY). Use to actually pull/correlate events, alerts, or entities. The human "time range" and "filters" become WHERE/time clauses here.',
    action_type: 'query',
    capability: 'read',
  },
  {
    tool_id: 'security.alerts',
    category: 'Alert search / analysis (READ-ONLY)',
    summary:
      'SEARCH/ANALYSIS ONLY. Search and analyze security alerts via natural language (translated to ES|QL over .alerts-security.alerts-*). Use instead of "open the Alerts page + adjust time + filter by severity". It CANNOT change alert status (ack/close), assign an alert, or add a note — those are capability gaps.',
    action_type: 'query',
    capability: 'read',
  },
  {
    tool_id: 'security.get_entity',
    category: 'Entity analysis (single entity)',
    summary:
      'Retrieve risk score, asset criticality, and analytics for a single host/user/service entity (READ-ONLY). Use instead of "open the host/user risk flyout".',
    action_type: 'enrichment',
    capability: 'read',
  },
  {
    tool_id: 'security.search_entities',
    category: 'Entity analysis (search)',
    summary:
      'Search entities by risk, asset criticality, or behavioral attributes (READ-ONLY). Use instead of "open Entity Analytics dashboard and sort/filter".',
    action_type: 'enrichment',
    capability: 'read',
  },
  {
    tool_id: 'security.entity_risk_score',
    category: 'Entity risk scoring',
    summary:
      'Fetch the risk score time series / contributing inputs for an entity (READ-ONLY). Use when the analyst inspected risk-score drivers.',
    action_type: 'enrichment',
    capability: 'read',
  },
  {
    tool_id: 'security.attack_discovery_search',
    category: 'Attack discovery',
    summary:
      'Find AI-generated attack discoveries correlated to given alert IDs (READ-ONLY). Use when the analyst was correlating an alert into a broader attack narrative.',
    action_type: 'enrichment',
    capability: 'read',
  },
  {
    tool_id: 'security.security_labs_search',
    category: 'Threat intelligence enrichment',
    summary:
      'Search Elastic Security Labs threat-intel knowledge (READ-ONLY). Use instead of "look up this indicator / TTP externally".',
    action_type: 'enrichment',
    capability: 'read',
  },
  {
    tool_id: 'platform.core.cases',
    category: 'Case SEARCH / GET (READ-ONLY)',
    summary:
      'READ-ONLY: search and get existing cases (and find cases attached to an alert). It CANNOT create, update, or attach to a case — those are capability gaps (fill with a workflow tool using the cases.createCase / cases.updateCase workflow steps). Use ONLY to look up existing cases, never to "Create case".',
    action_type: 'query',
    capability: 'read',
  },
  {
    tool_id: 'security.create_detection_rule',
    category: 'Detection engineering (creates a rule PROPOSAL)',
    summary:
      'Create a detection-rule PROPOSAL artifact. Use when the analyst concluded a new rule should be authored from the investigation. (This produces a rule proposal, not a live enabled rule.)',
    action_type: 'response_action',
    capability: 'write',
  },
  {
    tool_id: 'platform.core.create_visualization',
    category: 'Visualization authoring',
    summary:
      'Create a visualization artifact from a query/description. Use when the analyst built a chart to summarize findings.',
    action_type: 'response_action',
    capability: 'write',
  },
  {
    tool_id: 'platform.core.generate_workflow',
    category: 'Workflow authoring',
    summary:
      'Author an Elastic Workflow from a natural-language description. Use when the analyst described an automation to build.',
    action_type: 'response_action',
    capability: 'write',
  },
  {
    tool_id: 'platform.core.execute_connector_sub_action',
    category: 'External SOAR/ITSM/case-push connector sub-action',
    summary:
      'Invoke a sub-action on an EXTERNAL connector — SOAR/ITSM/case-push only (ServiceNow, TheHive, .cases-webhook, etc.). Use ONLY when the analyst pushed to an external ticketing/SOAR system. It is NOT endpoint isolation and NOT a way to change alert status — host isolation / endpoint response actions are capability gaps with no native mechanism.',
    action_type: 'response_action',
    capability: 'write',
  },
];

function renderToolCatalog(): string {
  const byCategory = AGENT_TOOL_CATALOG.map(
    (t) =>
      `  - tool_id: "${t.tool_id}" [${t.capability.toUpperCase()}] — ${t.category}: ${t.summary}`
  );
  return byCategory.join('\n');
}

/** Render the capability-gap catalog for the prompt. */
function renderCapabilityGaps(): string {
  return Object.entries(CAPABILITY_GAPS)
    .map(([action, g]) => `  - action: "${action}" (fill via ${g.suggested_fill}) — ${g.reason}`)
    .join('\n');
}

/** Map of tool_id -> definition for quick lookup during parsing. */
const TOOL_BY_ID = new Map(AGENT_TOOL_CATALOG.map((t) => [t.tool_id, t]));

/**
 * Robustly extract a JSON object from an LLM response. Handles:
 *  - raw JSON
 *  - JSON wrapped in ```json ... ``` or ``` ... ``` fences
 *  - JSON preceded/followed by explanatory prose
 * Returns the parsed object, or `undefined` if nothing parseable is found.
 */
function extractJson(raw: string): any | undefined {
  if (!raw) return undefined;
  const text = raw.trim();

  // 1. Strip markdown code fences if present and try the fenced content first.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  candidates.push(text);

  for (const candidate of candidates) {
    // Try a direct parse first (covers clean JSON output).
    try {
      return JSON.parse(candidate);
    } catch {
      // Fall through to brace-matching extraction.
    }
    // Grab the outermost balanced {...} block.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Continue to next candidate.
      }
    }
  }
  return undefined;
}

/**
 * Validate & normalize the per-step `provenance` the LLM emitted. Keeps only
 * recognized modalities so the UI never renders a fabricated source kind:
 *  - ui_action / voice / typed (this worker's modalities)
 *  - frame (screen keyframes sent to vision — owned by the vision layer)
 * Unknown kinds are dropped; common synonyms are mapped.
 */
function normalizeProvenance(raw: any): ProvenanceRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ProvenanceRef[] = [];
  for (const p of raw) {
    if (!p) continue;
    let type = String(p.type ?? '').toLowerCase();
    if (type === 'action') type = 'ui_action';
    if (type === 'narration') type = 'typed';
    if (type === 'screen' || type === 'video' || type === 'image') type = 'frame';
    if (type !== 'ui_action' && type !== 'voice' && type !== 'typed' && type !== 'frame') continue;
    out.push({
      type: type as ProvenanceRef['type'],
      ref: p.ref ? String(p.ref) : undefined,
      label: p.label ? String(p.label) : undefined,
    });
  }
  return out.length ? out : undefined;
}

/**
 * Tally the evidence that fed the synthesis, from the raw captured events
 * (ground truth — not LLM-asserted). Narration events carry `source`:
 *  - `voice` → browser-transcribed spoken segment
 *  - `typed` (or unset) → typed narration the analyst entered
 * Inline `event.narration` on an action also counts as a typed narration.
 *
 * `screenVideoPresent` is passed in by the route (it counts the media index);
 * the raw video is never analyzed, so it is surfaced but not a step source.
 */
export function buildProvenanceSummary(
  sessionGroups: Record<string, any[]>,
  screenVideoPresent: boolean
): SOPProvenance {
  let actionEventCount = 0;
  let voiceSegmentCount = 0;
  let narrationCount = 0;
  for (const events of Object.values(sessionGroups)) {
    for (const e of events) {
      if (e.event_type === 'narration') {
        // Voice transcripts are stored by the narrate route with
        // details.source === 'voice' (older/looser payloads may set e.source).
        if (e?.details?.source === 'voice' || e?.source === 'voice') voiceSegmentCount += 1;
        else narrationCount += 1;
      } else {
        actionEventCount += 1;
        if (e.narration) narrationCount += 1;
      }
    }
  }
  return {
    session_count: Object.keys(sessionGroups).length,
    action_event_count: actionEventCount,
    voice_segment_count: voiceSegmentCount,
    narration_count: narrationCount,
    screen_video_present: screenVideoPresent,
  };
}

export function buildSynthesisPrompt(
  sessionGroups: Record<string, any[]>,
  name: string,
  description?: string
): string {
  // Assign each piece of evidence a stable id ([S#-A#] action, [S#-V#] voice,
  // [S#-T#] typed) so the model can cite exact sources in per-step provenance.
  const fmtOffset = (ms?: number): string => {
    if (typeof ms !== 'number' || !isFinite(ms)) return '?';
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
  };
  const clock = (ts: string): string => {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toISOString().slice(11, 19);
  };

  const sessionSummaries = Object.entries(sessionGroups).map(([sid, events], i) => {
    const actionEvents = events.filter((e) => e.event_type !== 'narration');
    const narrations = events.filter((e) => e.event_type === 'narration');
    const voiceSegments = narrations.filter(
      (e) => e?.details?.source === 'voice' || e?.source === 'voice'
    );
    const typedNarrations = narrations.filter(
      (e) => !(e?.details?.source === 'voice' || e?.source === 'voice')
    );

    const actionLines = actionEvents.map((e, j) => {
      const id = `S${i + 1}-A${j + 1}`;
      const narr = typedNarrations.find(
        (n) =>
          Math.abs(
            new Date(n['@timestamp']).getTime() - new Date(e['@timestamp']).getTime()
          ) < 30000
      );
      let line = `  [${id}] (ui_action) [${e.event_type}] @${clock(e['@timestamp'])} ${e.description}`;
      // Surface the VERBATIM ES|QL the analyst actually ran (captured via fetch
      // interception of /internal/search/esql). This is concrete, grounded
      // evidence the model should reuse in query_template rather than inventing
      // a generic query.
      const queryText =
        typeof e?.details?.query_text === 'string' ? e.details.query_text : undefined;
      if (queryText) {
        line += `\n     Actual ES|QL run by the analyst (reuse/parameterize this — do NOT invent a generic query):\n       ${queryText.replace(/\n/g, '\n       ')}`;
      }
      if (e.narration) line += `\n     Analyst reasoning: "${e.narration}"`;
      if (narr) line += `\n     Analyst reasoning: "${narr.description}"`;
      return line;
    });

    const voiceLines = voiceSegments
      .slice()
      .sort((a, b) => (a.audio_start_ms ?? 0) - (b.audio_start_ms ?? 0))
      .map((v, j) => {
        const id = `S${i + 1}-V${j + 1}`;
        const span = `${fmtOffset(v.audio_start_ms)}–${fmtOffset(v.audio_end_ms)}`;
        return `  [${id}] (voice ${span}) "${v.description}"`;
      });

    const typedLines = typedNarrations.map((n, j) => {
      const id = `S${i + 1}-T${j + 1}`;
      return `  [${id}] (typed) "${n.description}"`;
    });

    return [
      `SESSION ${i + 1} (${sid}):`,
      `  UI ACTIONS:\n${actionLines.length ? actionLines.join('\n') : '    (none)'}`,
      `  VOICE TRANSCRIPT (timestamped, offsets from recording start):\n${
        voiceLines.length ? voiceLines.join('\n') : '    (no voice transcript captured)'
      }`,
      `  TYPED NARRATION:\n${typedLines.length ? typedLines.join('\n') : '    (none)'}`,
    ].join('\n');
  });

  return `You are an expert security operations engineer who converts how human analysts triage alerts into procedures that an AUTONOMOUS ELASTIC AI AGENT (Agent Builder) or an Elastic Workflow can execute.

CRITICAL FRAMING:
The recorded events below are HUMAN UI INTERACTIONS (clicking pages, adjusting time pickers, opening flyouts, adding table columns, scrolling). These are EVIDENCE OF THE ANALYST'S INTENT — they are NOT steps to reproduce. An AI agent does NOT click buttons or navigate pages. It CALLS TOOLS.

Your job: TRANSLATE the observed human workflow into the equivalent sequence of AGENT TOOL INVOCATIONS that achieve the same outcomes, expressed as a REUSABLE, GENERALIZED procedure (parameterized with placeholders — see GENERALIZATION RULES below). Infer intent primarily from the analyst's narration ("why"), using the UI actions as supporting evidence.

SOP Name: ${name}
${description ? `Description: ${description}` : ''}

RECORDED SESSIONS (human UI actions + analyst voice/typed narration, each tagged with a stable evidence id):
${sessionSummaries.join('\n\n')}

---

AVAILABLE ELASTIC AGENT TOOL CATALOG (choose tool_id values ONLY from this list).
Each tool is tagged [READ] or [WRITE] with its REAL capability. You MUST respect these:
${renderToolCatalog()}

CAPABILITY GAPS — SOC WRITE actions that have NO real built-in tool. If a step's
intent is one of these, DO NOT invent a tool_id and DO NOT map it onto a read-only
tool. Instead set "tool_id" to null/empty and emit a "capability_gap" object with the
matching action id, e.g. {"action":"create_case","reason":"...","suggested_fill":"workflow_tool"}:
${renderCapabilityGaps()}

---

GENERALIZATION RULES (CRITICAL — the SOP must be a REUSABLE procedure, not a replay
of this one recording):
- The concrete values you SEE on screen / in the events (host names like "SRVMAC08",
  usernames like "james", file hashes/sha256, IPs, specific alert UUIDs, specific dates
  or absolute time windows) are EXAMPLES of an entity CLASS — they are NOT literals to
  bake in. Parameterize them with placeholders so the SOP works on the NEXT alert:
    * host           → {{alert.host.name}}
    * user           → {{alert.user.name}}
    * file hash      → {{alert.file.hash.sha256}}
    * alert id       → {{alert.uuid}}
    * source/dest IP → {{alert.source.ip}} / {{alert.destination.ip}}
    * process        → {{alert.process.name}} / {{alert.process.entity_id}}
  In descriptions, refer to "the affected host", "the alerting user", "the file hash
  from the alert" — not the literal observed value.
- DERIVE TIME RANGES GENERICALLY from the alert timestamp or relative-now, e.g.
  "WHERE @timestamp >= alert.@timestamp - 24h" or "WHERE @timestamp >= NOW() - 24h".
  DO NOT copy a demo-data-specific absolute lookback like "30 months" / a fixed date.
  WHY: recorded sessions are usually DEMO DATA with old/static timestamps; the analyst
  widened the time picker only because the demo events are old. On LIVE data that
  literal window is wrong. The reusable SOP must scope time RELATIVE to the alert.
- KEEP the analyst's INTENT and decision logic exactly — just express it against the
  placeholders above. The shape of the investigation (which fields, which correlations,
  which thresholds) is the valuable signal; the specific demo values are not.
- You MAY keep a literal value ONLY when it is genuinely an invariant of the procedure
  (e.g. an index pattern like .alerts-security.alerts-*, a rule TYPE, a known-bad TTP),
  NOT when it is an observed entity instance.

LITERAL → GENERALIZED EXAMPLES:
- BAD (literal):     query_template: "FROM logs-* | WHERE host.name == \\"SRVMAC08\\" AND @timestamp >= \\"2023-01-01\\""
  GOOD (generalized): query_template: "FROM logs-* | WHERE host.name == {{alert.host.name}} AND @timestamp >= alert.@timestamp - 24h"
- BAD (literal):     description: "Look up risk score for user james over the last 30 months"
  GOOD (generalized): description: "Look up the risk score for the alerting user ({{alert.user.name}}) over a window relative to the alert."
- BAD (literal):     tool_params: "host.name = SRVMAC08"
  GOOD (generalized): tool_params: "host.name = {{alert.host.name}} (the affected host from the triggering alert)"

---

TRANSLATION RULES (apply rigorously):
- Each step must be an AGENT TOOL INVOCATION: which tool the agent calls, with what parameters, and WHY.
- Set "tool_id" to a value taken VERBATIM from the catalog above. Never invent tool ids. NEVER pick a [READ] tool for a step whose intent is to WRITE/mutate.
- For a WRITE action that is a CAPABILITY GAP (see list above), leave tool_id empty and emit "capability_gap" instead. This is REQUIRED for: creating/updating a case, changing alert status (ack/close), assigning an alert, adding an alert note, isolating/releasing a host, or any endpoint response action. Do NOT map these onto platform.core.cases or platform.core.execute_connector_sub_action.
- DROP pure-UI steps that have no agent-tool equivalent (opening a page, adjusting a time picker, adding a table column, scrolling, opening a flyout). FOLD their intent into the parameters of the relevant tool call. Example: "adjust time to last 90 days" + "filter by critical severity" + "open alerts page" all collapse into ONE security.alerts / execute_esql call whose parameters encode "critical severity, time relative to the alert".
- GROUND EVERY STEP IN THE REAL EVIDENCE, then GENERALIZE the values. Do NOT emit generic boilerplate like "Retrieve alerts" with hand-wavy params, but also do NOT bake in demo literals:
   * If an "Actual ES|QL run by the analyst" is shown for an action, REUSE its STRUCTURE (the fields, filters, correlations, aggregations) as the query_template — but REPLACE observed entity instances and absolute time windows with the placeholders above. Keep the analyst's logic; drop the demo specifics.
   * If screen frames are attached, read the ACTUAL values on screen to UNDERSTAND what the analyst inspected (which rule, which fields, which entity TYPE), then express the step generically with placeholders. Cite the [F#] frame you read them from.
   * Use {{placeholders}} for every value that varies per-invocation (entities, hashes, ids, time anchors). Reserve literals for true procedural invariants only.
- For query steps, put a concrete-but-PARAMETERIZED ES|QL template in "query_template". The human time range and filters belong inside this query (relative to the alert), not as separate steps.
- For enrichment/entity steps, put the entity CLASS + placeholder in "tool_params" (e.g. "host.name = {{alert.host.name}}").
- Emit branch logic the analyst showed as "decision_points" (agent reasoning branches), not as UI clicks.
- "intent" must come from the analyst narration and should justify the tool choice.
- Include a step only if it reflects a real investigative intent seen in at least one session. Mark optional if it appeared in fewer than 50% of sessions.
- PROVENANCE IS MANDATORY: for every step, populate "provenance" with the exact evidence ids that justified it — UI actions ([S#-A#], type "ui_action"), voice transcript segments ([S#-V#], type "voice"; put the time span in the label), typed narration ([S#-T#], type "typed"), and, if screen frame images are attached to this message, the matching screen frames ([F#], type "frame"). Only cite ids that actually appear in this message. Do NOT invent sources.

EXAMPLE TRANSLATIONS (human → agent, GENERALIZED):
- "Open Alerts Page" + "set time to 90d" + "filter critical severity" → tool_id "security.alerts", query_template retrieving critical alerts over a window relative to the alert (NOT a fixed 90d/30-month literal).
- "Inspect host alert flyout for SRVMAC08" → tool_id "security.get_entity", tool_params "host.name = {{alert.host.name}}".
- "Open Timeline, add user.name column, review rows" → tool_id "platform.core.execute_esql", query_template correlating events for {{alert.user.name}} grouped by user.name.
- "Look up existing case for this alert" → tool_id "platform.core.cases" (READ-ONLY lookup only).
- "Create case / escalate" → CAPABILITY GAP: tool_id empty, capability_gap {"action":"create_case","suggested_fill":"workflow_tool"} (platform.core.cases CANNOT create).
- "Acknowledge / close the alert" → CAPABILITY GAP: capability_gap {"action":"set_alert_status","suggested_fill":"workflow_tool"} (security.alerts is read-only).
- "Isolate host" → CAPABILITY GAP: capability_gap {"action":"isolate_host","suggested_fill":"custom_connector"} (no native tool/step; needs custom connector).

Produce a structured SOP in EXACTLY this JSON format:

{
  "steps": [
    {
      "order": 1,
      "name": "Retrieve critical alerts (relative to the alert)",
      "description": "Agent-facing instruction: call the alert search tool to retrieve critical-severity alerts in a window relative to the triggering alert.",
      "action_type": "query|enrichment|decision|response_action|case_action|manual",
      "tool_id": "security.alerts",
      "tool_params": "natural-language or key=value parameters for the tool call (use {{placeholders}})",
      "query_template": "ES|QL template if the tool is query-based (use {{placeholders}} and alert-relative time)",
      "capability_gap": { "action": "create_case", "reason": "why no real tool can do this", "suggested_fill": "workflow_tool" },
      "intent": "Why this step matters (from analyst narration)",
      "confidence": 0.0-1.0,
      "is_optional": false,
      "provenance": [
        { "type": "ui_action", "ref": "S1-A2", "label": "alert.clicked @11:30:04" },
        { "type": "voice", "ref": "S1-V1", "label": "voice 5s–20s" },
        { "type": "typed", "ref": "S1-T1", "label": "typed narration" }
      ]
    }
  ],
  "trigger_conditions": "When this SOP should activate",
  "expected_duration_minutes": 10,
  "decision_points": [
    {
      "after_step": 2,
      "condition": "If lateral movement spans > 3 hosts",
      "escalate_to_step": 5,
      "otherwise": "continue"
    }
  ]
}

(Omit "tool_id" for capability-gap and pure-reasoning steps; omit "capability_gap" for normal tool steps.)

Respond with ONLY the JSON object, no other text.`;
}

/** Coerce a model-provided tool_id to a catalog id, or undefined. */
function normalizeToolId(raw: any): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const id = raw.trim();
  if (TOOL_BY_ID.has(id)) return id;
  // Tolerate minor drift (e.g. missing namespace) by matching on suffix.
  const match = AGENT_TOOL_CATALOG.find(
    (t) => t.tool_id.endsWith(`.${id}`) || t.tool_id === `security.${id}` || t.tool_id === `platform.core.${id}`
  );
  return match?.tool_id;
}

/**
 * Infer a sensible tool_id from action_type / query presence when the model
 * omits one. Returns a tool ONLY for READ/legitimate-write mappings — it will
 * NEVER map a write action onto a read-only tool. case_action and
 * response_action no longer auto-map to platform.core.cases /
 * execute_connector_sub_action, because those are capability gaps; gap
 * detection (`detectCapabilityGap`) handles them instead.
 */
function inferToolId(actionType: SOPStep['action_type'], hasQuery: boolean): string | undefined {
  switch (actionType) {
    case 'query':
      return hasQuery ? 'platform.core.execute_esql' : 'security.alerts';
    case 'enrichment':
      return 'security.get_entity';
    default:
      // case_action / response_action / decision / manual: no safe auto-map.
      return undefined;
  }
}

/**
 * Decide whether a step is a CAPABILITY GAP (a SOC write action with no real
 * built-in tool). Honors an explicit `capability_gap` the model emitted, and
 * otherwise infers one from the action_type + intent text so we never silently
 * map a write action onto a read-only tool. Returns the gap (with a stable
 * action id from CAPABILITY_GAPS) or undefined.
 */
function detectCapabilityGap(raw: any, actionType: SOPStep['action_type']): CapabilityGap | undefined {
  // 1. Trust an explicit capability_gap from the model if its action is known.
  const explicit = raw?.capability_gap;
  if (explicit && typeof explicit === 'object') {
    const action = String(explicit.action ?? '').trim();
    const known = CAPABILITY_GAPS[action];
    if (known) {
      return {
        action,
        reason: typeof explicit.reason === 'string' && explicit.reason.trim() ? explicit.reason : known.reason,
        suggested_fill: known.suggested_fill,
      };
    }
  }

  // 2. Infer from text for write-ish steps the model labeled as case/response.
  if (actionType !== 'case_action' && actionType !== 'response_action') return undefined;
  const hay = `${raw?.name ?? ''} ${raw?.description ?? ''} ${raw?.intent ?? ''} ${
    raw?.tool_params ?? ''
  }`.toLowerCase();

  const inferAction = (): string | undefined => {
    if (/isolat/.test(hay)) return 'isolate_host';
    if (/release.*host|unisolat|un-isolat/.test(hay)) return 'release_host';
    if (/(kill|terminate).*process|get[- ]file|response action|respond/.test(hay))
      return 'endpoint_response_action';
    if (/assign/.test(hay)) return 'assign_alert';
    if (/(add|attach).*(note|comment).*(alert)|alert.*note/.test(hay)) return 'add_alert_note';
    if (/(acknowledg|close|open|in.?progress|mark).*alert|alert.*(status|acknowledg|close)/.test(hay))
      return 'set_alert_status';
    if (/update.*case|attach.*case|add.*case|escalat/.test(hay)) return 'update_case';
    if (/creat.*case|new case|open.*case/.test(hay)) return 'create_case';
    if (actionType === 'case_action') return 'create_case';
    return undefined;
  };

  const action = inferAction();
  if (!action) return undefined;
  const known = CAPABILITY_GAPS[action];
  if (!known) return undefined;
  return { action, reason: known.reason, suggested_fill: known.suggested_fill };
}

export function parseSOPFromLLM(
  llmOutput: string,
  meta: {
    name: string;
    description: string;
    session_ids: string[];
  }
): SynthesizedSOP {
  // Extract JSON from the LLM response. LLMs frequently wrap JSON in markdown
  // code fences or add a sentence of preamble, so we strip fences first and
  // then fall back to grabbing the outermost {...} block.
  let parsed: any;
  try {
    parsed = extractJson(llmOutput);
    if (!parsed) throw new Error('No JSON found in LLM output');
  } catch {
    // Fallback: create a basic SOP from the raw text
    const fallbackSteps: SOPStep[] = [
      {
        id: 'step_01',
        order: 1,
        name: 'Retrieve triggering alert',
        description: 'Call the alert search tool to retrieve the triggering alert and its context.',
        action_type: 'query',
        tool_id: 'security.alerts',
        confidence: 1.0,
        is_optional: false,
      },
    ];
    return {
      id: '',
      name: meta.name,
      description: meta.description || llmOutput.slice(0, 200),
      steps: fallbackSteps,
      confidence: 0.5,
      session_ids: meta.session_ids,
      tool_ids: collectToolIds(fallbackSteps),
      skill_output: generateSkillMarkdown(meta.name, fallbackSteps),
      workflow_output: generateWorkflowYaml(fallbackSteps),
    };
  }

  const rawSteps: SOPStep[] = (parsed.steps ?? []).map((s: any, i: number) => {
    const actionType: SOPStep['action_type'] = s.action_type ?? 'manual';
    const hasQuery = typeof s.query_template === 'string' && s.query_template.trim().length > 0;
    // A capability gap (create case, set alert status, isolate host, …) means
    // NO real tool can do this — never emit a (bogus) tool_id for it.
    const capabilityGap = detectCapabilityGap(s, actionType);
    const toolId = capabilityGap
      ? undefined
      : normalizeToolId(s.tool_id) ?? inferToolId(actionType, hasQuery);
    return {
      id: `step_${String(i + 1).padStart(2, '0')}_${(s.name ?? '')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .slice(0, 30)}`,
      order: s.order ?? i + 1,
      name: s.name ?? `Step ${i + 1}`,
      description: s.description ?? '',
      action_type: actionType,
      tool_id: toolId,
      tool_params: typeof s.tool_params === 'string' ? s.tool_params : undefined,
      query_template: s.query_template,
      intent: s.intent,
      confidence: s.confidence ?? 1.0,
      is_optional: s.is_optional ?? false,
      capability_gap: capabilityGap,
      provenance: normalizeProvenance(s.provenance),
    };
  });

  // Quality pass: repair/flag steps (valid tool_id, non-empty query, grounding).
  const steps = validateAndRepairSteps(rawSteps);

  const confidence =
    steps.length > 0 ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length : 0;

  const sop: SynthesizedSOP = {
    id: '',
    name: meta.name,
    description: meta.description || parsed.trigger_conditions || '',
    steps,
    confidence,
    session_ids: meta.session_ids,
    tool_ids: collectToolIds(steps),
    skill_output: generateSkillMarkdown(meta.name, steps, parsed),
    workflow_output: generateWorkflowYaml(steps, parsed),
    trigger_conditions:
      typeof parsed.trigger_conditions === 'string' ? parsed.trigger_conditions : undefined,
    decision_points: Array.isArray(parsed.decision_points) ? parsed.decision_points : undefined,
  };

  return sop;
}

/** Distinct tool_ids referenced by the steps, in first-seen order. */
function collectToolIds(steps: SOPStep[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of steps) {
    if (s.tool_id && !seen.has(s.tool_id)) {
      seen.add(s.tool_id);
      out.push(s.tool_id);
    }
  }
  return out;
}

/**
 * Post-generation quality pass over the parsed steps. This does NOT call the
 * model again; it normalizes/repairs the structured output so the SOP is
 * trustworthy:
 *  - Drop empty/nameless steps.
 *  - Guarantee every step has a catalog tool_id (infer when missing); steps
 *    that still can't map to a tool become `manual` reasoning steps.
 *  - For query-type steps with no query_template, downgrade confidence and add
 *    a note so the UI flags them rather than presenting a hollow query step.
 *  - Lower confidence for steps with no provenance (model-inferred, not grounded).
 * Returns the cleaned steps; callers recompute confidence/tool_ids from these.
 */
export function validateAndRepairSteps(steps: SOPStep[]): SOPStep[] {
  const cleaned: SOPStep[] = [];
  for (const step of steps) {
    if (!step.name || !step.name.trim()) continue;

    let confidence = typeof step.confidence === 'number' ? step.confidence : 1.0;
    const hasQuery =
      typeof step.query_template === 'string' && step.query_template.trim().length > 0;

    let actionType = step.action_type;
    let description = step.description ?? '';
    const capabilityGap = step.capability_gap;

    // CAPABILITY GAP: a write action no built-in tool can perform. Never assign
    // a tool_id (esp. not a read-only one); keep the gap so the UI can propose a
    // workflow-tool fill. If a gap step still carries a bogus tool_id, strip it.
    let toolId: string | undefined;
    if (capabilityGap) {
      toolId = undefined;
      if (!description.includes('[capability gap]')) {
        description = description
          ? `${description} [capability gap: ${capabilityGap.action}]`
          : `Capability gap: ${capabilityGap.action} — no built-in tool can perform this. [capability gap: ${capabilityGap.action}]`;
      }
    } else {
      // Ensure a valid tool_id; if a query step lost its query, it's weaker.
      toolId = step.tool_id && TOOL_BY_ID.has(step.tool_id) ? step.tool_id : undefined;
      if (!toolId) toolId = normalizeToolId(step.tool_id) ?? inferToolId(step.action_type, hasQuery);

      // Guard: never let a WRITE action keep a READ-only tool. If that happened
      // (model drift), drop the tool and flag it as a gap by inference.
      const def = toolId ? TOOL_BY_ID.get(toolId) : undefined;
      if (
        def &&
        def.capability === 'read' &&
        (actionType === 'case_action' || actionType === 'response_action')
      ) {
        toolId = undefined;
      }
    }

    // A query step with no concrete query is hollow boilerplate — flag it.
    if (actionType === 'query' && !hasQuery && !capabilityGap) {
      confidence = Math.min(confidence, 0.4);
      if (!description.includes('[needs query]')) {
        description = description
          ? `${description} [needs query]`
          : 'Query step is missing a concrete ES|QL template. [needs query]';
      }
    }

    // No tool and not a decision/manual/gap step → treat as reasoning.
    if (!toolId && !capabilityGap && actionType !== 'decision' && actionType !== 'manual') {
      actionType = 'manual';
    }

    // Ungrounded steps (no provenance) are model-inferred; reflect that in score.
    const grounded = !!step.provenance && step.provenance.length > 0;
    if (!grounded) confidence = Math.min(confidence, 0.6);

    cleaned.push({
      ...step,
      action_type: actionType,
      tool_id: toolId,
      capability_gap: capabilityGap,
      description,
      confidence: Math.max(0, Math.min(1, confidence)),
    });
  }
  return cleaned;
}


function generateSkillMarkdown(name: string, steps: SOPStep[], parsed?: any): string {
  const toolIds = collectToolIds(steps);
  const lines: string[] = [
    `# ${name}`,
    '',
    'You are a security operations agent. Execute this procedure by calling the Agent Builder tools referenced below. Do NOT describe UI navigation — every step is a tool invocation.',
    '',
    '## When to Activate',
    '',
    parsed?.trigger_conditions ?? 'Activate when relevant security alerts require triage.',
    '',
    '## Tools used',
    '',
    toolIds.length ? toolIds.map((t) => `- \`${t}\``).join('\n') : '- (none)',
    '',
    '## Procedure',
    '',
  ];

  for (const step of steps) {
    lines.push(`### ${step.order}. ${step.name}${step.is_optional ? ' (optional)' : ''}`);
    lines.push('');
    if (step.tool_id) {
      lines.push(`**Tool:** \`${step.tool_id}\``);
      lines.push('');
    } else if (step.capability_gap) {
      lines.push(
        `**Capability gap:** \`${step.capability_gap.action}\` — no built-in tool can perform this. ` +
          `Suggested fill: ${step.capability_gap.suggested_fill}.`
      );
      lines.push('');
    }
    lines.push(step.description);
    if (step.tool_params) {
      lines.push('');
      lines.push(`**Parameters:** ${step.tool_params}`);
    }
    if (step.intent) {
      lines.push('');
      lines.push(`**Why:** ${step.intent}`);
    }
    if (step.query_template) {
      lines.push('');
      lines.push('```esql');
      lines.push(step.query_template);
      lines.push('```');
    }
    lines.push('');
  }

  if (parsed?.decision_points?.length) {
    lines.push('## Decision Points');
    lines.push('');
    for (const dp of parsed.decision_points) {
      lines.push(
        `- After step ${dp.after_step}: **If** ${dp.condition} → go to step ${dp.escalate_to_step}. Otherwise: ${dp.otherwise}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function generateWorkflowYaml(steps: SOPStep[], parsed?: any): string {
  const lines: string[] = [
    'triggers:',
    '  - type: alert',
    '    with:',
    '      severity: ["high", "critical"]',
    '',
    'steps:',
  ];

  for (const step of steps) {
    lines.push(`  - name: ${step.id}`);
    if (step.query_template) {
      // REAL ES|QL workflow step type is `elasticsearch.esql.query`.
      lines.push('    type: elasticsearch.esql.query');
      lines.push('    with:');
      lines.push(`      query: "${step.query_template.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`);
    } else if (step.capability_gap) {
      // A write action with no built-in tool — but it DOES have a real Kibana
      // API. Emit the SAME accurate real step the gap-fill proposer uses
      // (kibana.createCase / kibana.SetAlertsStatus / http to the documented
      // endpoint, e.g. POST /api/endpoint/action/isolate). Never a fake step.
      const gapLines = gapActionStepLines(step.capability_gap.action, step.id);
      // gapActionStepLines re-emits the `- name:` line; we already pushed ours.
      lines.pop();
      for (const l of gapLines) lines.push(l);
    } else if (step.tool_id) {
      // Enrichment / decision steps invoke an agent tool/skill via ai.agent.
      lines.push('    type: ai.agent');
      lines.push('    with:');
      lines.push(`      tool_id: "${step.tool_id}"`);
      if (step.tool_params) {
        lines.push(`      params: "${step.tool_params.replace(/"/g, '\\"')}"`);
      }
      lines.push(`      prompt: "${step.name}: ${step.description.slice(0, 100).replace(/"/g, '\\"')}"`);
    } else {
      lines.push('    type: ai.agent');
      lines.push('    with:');
      lines.push(`      prompt: "${step.name}: ${step.description.slice(0, 100).replace(/"/g, '\\"')}"`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
